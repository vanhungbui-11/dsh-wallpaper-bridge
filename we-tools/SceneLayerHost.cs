using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

class SceneLayerHost {
  const int GWL_STYLE = -16;
  const long WS_CHILD = 0x40000000L, WS_POPUP = unchecked((long)0x80000000);
  const uint WM_CLOSE = 0x0010, SWP_NOACTIVATE = 0x0010, SWP_FRAMECHANGED = 0x0020, SWP_SHOWWINDOW = 0x0040;
  static readonly IntPtr HWND_BOTTOM = new IntPtr(1);
  delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr data);
  [StructLayout(LayoutKind.Sequential)] struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr data);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", EntryPoint = "GetWindowLongPtr", SetLastError = true)] static extern IntPtr GetWindowLongPtr64(IntPtr hwnd, int index);
  [DllImport("user32.dll", EntryPoint = "SetWindowLongPtr", SetLastError = true)] static extern IntPtr SetWindowLongPtr64(IntPtr hwnd, int index, IntPtr value);
  [DllImport("user32.dll", EntryPoint = "GetWindowLong", SetLastError = true)] static extern int GetWindowLong32(IntPtr hwnd, int index);
  [DllImport("user32.dll", EntryPoint = "SetWindowLong", SetLastError = true)] static extern int SetWindowLong32(IntPtr hwnd, int index, int value);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int width, int height, uint flags);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);

  enum EDataFlow { eRender, eCapture, eAll }
  enum ERole { eConsole, eMultimedia, eCommunications }
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(EDataFlow dataFlow, int stateMask, out object devices);
    int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice device);
    int GetDevice(string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
    int OpenPropertyStore(int access, out IntPtr store);
    int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
    int GetState(out int state);
  }
  [ComImport, Guid("BFA971F1-4D5E-40BB-935E-967039BFBEE4"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(ref Guid groupingParam, uint streamFlags, out IAudioSessionControl sessionControl);
    int GetSimpleAudioVolume(ref Guid groupingParam, uint streamFlags, out ISimpleAudioVolume audioVolume);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessionEnumerator);
    int RegisterSessionNotification(IntPtr sessionNotification);
    int UnregisterSessionNotification(IntPtr sessionNotification);
    int RegisterDuckNotification(string sessionId, IntPtr duckNotification);
    int UnregisterDuckNotification(IntPtr duckNotification);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int sessionCount);
    int GetSession(int sessionCount, out IAudioSessionControl session);
  }
  [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl {
    int GetState(out int state);
    int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid context);
    int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid context);
    int GetGroupingParam(out Guid value);
    int SetGroupingParam(ref Guid value, ref Guid context);
    int RegisterAudioSessionNotification(IntPtr notification);
    int UnregisterAudioSessionNotification(IntPtr notification);
  }
  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 : IAudioSessionControl {
    new int GetState(out int state);
    new int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string value);
    new int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid context);
    new int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string value);
    new int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string value, ref Guid context);
    new int GetGroupingParam(out Guid value);
    new int SetGroupingParam(ref Guid value, ref Guid context);
    new int RegisterAudioSessionNotification(IntPtr notification);
    new int UnregisterAudioSessionNotification(IntPtr notification);
    int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string value);
    int GetProcessId(out uint processId);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface ISimpleAudioVolume {
    int SetMasterVolume(float level, ref Guid context);
    int GetMasterVolume(out float level);
    int SetMute(bool mute, ref Guid context);
    int GetMute(out bool mute);
  }

  static IntPtr scene, parent, previousParent, previousStyle;
  static bool attached;
  static bool TitleMatches(IntPtr hwnd, string title) {
    var text = new StringBuilder(512); GetWindowText(hwnd, text, text.Capacity);
    return text.ToString() == title;
  }
  static IntPtr FindByTitle(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hwnd, _) => {
      if (TitleMatches(hwnd, title)) { found = hwnd; return false; }
      EnumChildWindows(hwnd, (child, data) => {
        if (TitleMatches(child, title)) { found = child; return false; }
        return true;
      }, IntPtr.Zero);
      return found == IntPtr.Zero;
    }, IntPtr.Zero);
    return found;
  }
  static IntPtr GetStyle(IntPtr hwnd) { return IntPtr.Size == 8 ? GetWindowLongPtr64(hwnd, GWL_STYLE) : new IntPtr(GetWindowLong32(hwnd, GWL_STYLE)); }
  static void SetStyle(IntPtr hwnd, IntPtr value) { if (IntPtr.Size == 8) SetWindowLongPtr64(hwnd, GWL_STYLE, value); else SetWindowLong32(hwnd, GWL_STYLE, value.ToInt32()); }
  static void Layout() {
    RECT rect;
    if (attached && GetClientRect(parent, out rect)) SetWindowPos(scene, HWND_BOTTOM, 0, 0, Math.Max(1, rect.Right - rect.Left), Math.Max(1, rect.Bottom - rect.Top), SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
  }
  static void Restore() {
    if (!attached) return;
    try {
      if (!IsWindow(parent) && IsWindow(scene)) PostMessage(scene, WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
      else { SetParent(scene, previousParent); SetStyle(scene, previousStyle); SetWindowPos(scene, IntPtr.Zero, -1600, 0, 1, 1, SWP_NOACTIVATE | SWP_FRAMECHANGED); }
    } catch { }
    attached = false;
  }
  // 只匹配 DSH 专用场景窗口所属进程的 Core Audio 会话，避免 Wallpaper Engine 全局静音。
  static int SetSceneAudio(string title, bool on) {
    IntPtr hwnd = FindByTitle(title);
    uint processId;
    if (hwnd == IntPtr.Zero || GetWindowThreadProcessId(hwnd, out processId) == 0) return 1;
    IMMDeviceEnumerator devices = (IMMDeviceEnumerator)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")));
    IMMDevice device = null;
    IAudioSessionManager2 manager = null;
    IAudioSessionEnumerator sessions = null;
    var changed = 0;
    try {
      Marshal.ThrowExceptionForHR(devices.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eMultimedia, out device));
      var iid = new Guid("BFA971F1-4D5E-40BB-935E-967039BFBEE4"); object raw;
      Marshal.ThrowExceptionForHR(device.Activate(ref iid, 23, IntPtr.Zero, out raw));
      manager = (IAudioSessionManager2)raw;
      Marshal.ThrowExceptionForHR(manager.GetSessionEnumerator(out sessions));
      int count; Marshal.ThrowExceptionForHR(sessions.GetCount(out count));
      for (var i = 0; i < count; i++) {
        IAudioSessionControl control = null;
        try {
          Marshal.ThrowExceptionForHR(sessions.GetSession(i, out control));
          var control2 = control as IAudioSessionControl2; uint owner;
          if (control2 == null || control2.GetProcessId(out owner) != 0 || owner != processId) continue;
          var volume = control as ISimpleAudioVolume;
          if (volume == null) continue;
          var context = Guid.Empty;
          Marshal.ThrowExceptionForHR(volume.SetMute(!on, ref context));
          changed++;
        } finally { if (control != null) Marshal.ReleaseComObject(control); }
      }
    } finally {
      if (sessions != null) Marshal.ReleaseComObject(sessions);
      if (manager != null) Marshal.ReleaseComObject(manager);
      if (device != null) Marshal.ReleaseComObject(device);
      if (devices != null) Marshal.ReleaseComObject(devices);
    }
    Console.WriteLine("{\"ok\":true,\"changed\":" + changed + "}");
    return 0;
  }
  static int Main(string[] args) {
    if (args.Length == 3 && args[0] == "audio" && (args[2] == "on" || args[2] == "off")) {
      try { return SetSceneAudio(args[1], args[2] == "on"); } catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
    if (args.Length != 2) { Console.Error.WriteLine("usage: SceneLayerHost <parent-hwnd-hex> <we-window-title> | audio <we-window-title> <on|off>"); return 2; }
    try {
      parent = new IntPtr(long.Parse(args[0].Replace("0x", ""), System.Globalization.NumberStyles.HexNumber));
      for (var i = 0; i < 40 && scene == IntPtr.Zero; i++) { scene = FindByTitle(args[1]); if (scene == IntPtr.Zero) Thread.Sleep(100); }
      if (parent == IntPtr.Zero || scene == IntPtr.Zero || !IsWindow(parent)) return 1;
      previousStyle = GetStyle(scene); previousParent = SetParent(scene, parent);
      SetStyle(scene, new IntPtr((previousStyle.ToInt64() & ~WS_POPUP) | WS_CHILD));
      attached = true; Layout(); Console.WriteLine("{\"ok\":true}");
      while (IsWindow(parent) && IsWindow(scene)) { Layout(); Thread.Sleep(250); }
      Restore(); return 0;
    } catch (Exception error) { Console.Error.WriteLine(error.Message); Restore(); return 1; }
  }
}
