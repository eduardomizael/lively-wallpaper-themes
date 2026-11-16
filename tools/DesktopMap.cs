using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class DesktopMap {
    [StructLayout(LayoutKind.Sequential)] public struct Point { public int x, y; }
    [StructLayout(LayoutKind.Sequential)] public struct Rect { public int left, top, right, bottom; }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct MonitorInfo {
        public int size; public Rect monitor, work; public uint flags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string device;
    }
    public class Monitor { public string device; public int x,y,width,height; public bool primary; }
    public class Icon { public int id,x,y,width,height; }
    public class Snapshot { public Monitor[] monitors; public Icon[] icons; public string updatedAt; public string error; }
    delegate bool WindowCallback(IntPtr window, IntPtr data);
    delegate bool MonitorCallback(IntPtr monitor, IntPtr dc, ref Rect rect, IntPtr data);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindWindowEx(IntPtr parent, IntPtr after, string cls, string title);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr data);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr dc, IntPtr clip, MonitorCallback callback, IntPtr data);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern bool GetMonitorInfo(IntPtr monitor, ref MonitorInfo info);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
    [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr window, uint msg, IntPtr wp, IntPtr lp, uint flags, uint timeout, out UIntPtr result);
    [DllImport("user32.dll")] static extern bool ClientToScreen(IntPtr window, ref Point point);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, UIntPtr size, uint allocation, uint protect);
    [DllImport("kernel32.dll")] static extern bool VirtualFreeEx(IntPtr process, IntPtr address, UIntPtr size, uint kind);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool WriteProcessMemory(IntPtr process, IntPtr address, byte[] data, UIntPtr size, out UIntPtr written);
    [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] data, UIntPtr size, out UIntPtr read);
    static long Send(IntPtr window, uint message, int wp, IntPtr lp) {
        UIntPtr result;
        if(SendMessageTimeout(window,message,new IntPtr(wp),lp,2,1000,out result)==IntPtr.Zero) throw new Exception("Explorer não respondeu ao mapeamento.");
        return (long)result.ToUInt64();
    }
    public static Snapshot Capture() {
        IntPtr previous=IntPtr.Zero;
        try { previous=SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch(EntryPointNotFoundException) { }
        try { return CapturePhysical(); }
        finally { if(previous!=IntPtr.Zero) SetThreadDpiAwarenessContext(previous); }
    }
    static Snapshot CapturePhysical() {
        var snapshot=new Snapshot(); snapshot.updatedAt=DateTime.UtcNow.ToString("o");
        var monitors=new List<Monitor>();
        EnumDisplayMonitors(IntPtr.Zero,IntPtr.Zero,delegate(IntPtr handle,IntPtr dc,ref Rect rect,IntPtr data) {
            var info=new MonitorInfo(); info.size=Marshal.SizeOf(typeof(MonitorInfo));
            if(GetMonitorInfo(handle,ref info)) monitors.Add(new Monitor { device=info.device,x=info.monitor.left,y=info.monitor.top,width=info.monitor.right-info.monitor.left,height=info.monitor.bottom-info.monitor.top,primary=(info.flags&1)!=0 });
            return true;
        },IntPtr.Zero);
        monitors.Sort(delegate(Monitor a,Monitor b) { if(a.primary!=b.primary) return a.primary?-1:1; int x=a.x.CompareTo(b.x); return x!=0?x:a.y.CompareTo(b.y); });
        snapshot.monitors=monitors.ToArray(); snapshot.icons=new Icon[0];
        IntPtr list=IntPtr.Zero;
        EnumWindows(delegate(IntPtr window,IntPtr data) {
            var view=FindWindowEx(window,IntPtr.Zero,"SHELLDLL_DefView",null);
            if(view!=IntPtr.Zero) list=FindWindowEx(view,IntPtr.Zero,"SysListView32",null);
            return list==IntPtr.Zero;
        },IntPtr.Zero);
        if(list==IntPtr.Zero) { snapshot.error="Lista de ícones não encontrada. Verifique se os ícones da área de trabalho estão visíveis."; return snapshot; }
        uint pid; GetWindowThreadProcessId(list,out pid);
        var process=OpenProcess(0x38,false,pid);
        if(process==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
        IntPtr memory=IntPtr.Zero;
        try {
            memory=VirtualAllocEx(process,IntPtr.Zero,new UIntPtr(16),0x3000,4);
            if(memory==IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());
            int count=(int)Send(list,0x1004,0,IntPtr.Zero);
            var icons=new List<Icon>();
            for(int i=0;i<count;i++) {
                byte[] bytes=new byte[16]; bytes[0]=1; // LVIR_ICON: only the icon graphic, without its caption.
                UIntPtr transferred;
                if(!WriteProcessMemory(process,memory,bytes,new UIntPtr(16),out transferred)) throw new Win32Exception();
                if(Send(list,0x100E,i,memory)==0) continue;
                if(!ReadProcessMemory(process,memory,bytes,new UIntPtr(16),out transferred) || transferred.ToUInt64()!=16) throw new Win32Exception();
                int left=BitConverter.ToInt32(bytes,0),top=BitConverter.ToInt32(bytes,4);
                var point=new Point { x=left,y=top };
                if(!ClientToScreen(list,ref point)) throw new Win32Exception();
                icons.Add(new Icon { id=i,x=point.x,y=point.y,width=BitConverter.ToInt32(bytes,8)-left,height=BitConverter.ToInt32(bytes,12)-top });
            }
            snapshot.icons=icons.ToArray();
        } finally {
            if(memory!=IntPtr.Zero) VirtualFreeEx(process,memory,UIntPtr.Zero,0x8000);
            CloseHandle(process);
        }
        return snapshot;
    }
}
