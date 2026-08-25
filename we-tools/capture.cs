// capture.cs — 轻量窗口捕获工具（场景壁纸原画质注入用）
// 编译：C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /optimize /platform:anycpu capture.cs
// 用法：
//   capture.exe -title <窗口标题> <输出文件> [JPEG质量1-100]
//   capture.exe -hwnd  <窗口句柄> <输出文件> [JPEG质量1-100]
//   capture.exe -title <窗口标题> -bottom <输出文件> [JPEG质量1-100]   （先置底再捕获）
// 输出文件以 .png 结尾输出 PNG，否则输出 JPEG。
// 原理：PrintWindow + PW_RENDERFULLCONTENT（0x2），让 DWM 把 GPU 合成后的窗口内容渲染进 GDI 表面，
//       可捕获 OpenGL/DirectX 硬件加速窗口，且窗口被遮挡/置底时仍能拿到完整画面（最小化不行）。
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;

class Capture {
  const uint PW_RENDERFULLCONTENT = 0x2;
  const uint SWP_NOMOVE = 0x1, SWP_NOSIZE = 0x2, SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40;

  delegate bool EnumWindowsProc(IntPtr h, IntPtr l);

  [DllImport("user32.dll")] static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumChildWindows(IntPtr parent, EnumWindowsProc cb, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);

  struct RECT { public int Left, Top, Right, Bottom; }

  static bool TitleMatches(IntPtr hwnd, string title) {
    var text = new StringBuilder(512);
    GetWindowText(hwnd, text, text.Capacity);
    return text.ToString() == title;
  }
  static IntPtr FindByTitle(string title) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      if (TitleMatches(h, title)) { found = h; return false; }
      EnumChildWindows(h, (child, data) => {
        if (TitleMatches(child, title)) { found = child; return false; }
        return true;
      }, IntPtr.Zero);
      return found == IntPtr.Zero;
    }, IntPtr.Zero);
    return found;
  }

  static int Main(string[] args) {
    if (args.Length < 2) {
      Console.Error.WriteLine("usage: capture.exe (-title <t> | -hwnd <h>) [-bottom] <outfile> [quality]");
      return 2;
    }
    SetProcessDPIAware();

    // ---- record 模式：-title <t> -record <WxH> <fps> <durationSec> ----
    // 循环 PrintWindow 抓帧，按 bgr24 rawvideo 写 stdout（供 ffmpeg -f rawvideo 编码），
    // 帧率通过睡眠补偿到目标 fps；窗口消失提前退出。用于场景壁纸预转码。
    int recIdx = -1;
    for (int i = 0; i < args.Length; i++) if (args[i].ToLowerInvariant() == "-record") { recIdx = i; break; }
    if (recIdx >= 0) {
      if (args.Length < 2 || args[0].ToLowerInvariant() != "-title") {
        Console.Error.WriteLine("record 模式：capture.exe -title <t> -record <WxH> <fps> <durationSec>");
        return 2;
      }
      string title = args[1];
      string size = (recIdx + 1 < args.Length) ? args[recIdx + 1] : "1920x1080";
      int fps = (recIdx + 2 < args.Length) ? int.Parse(args[recIdx + 2]) : 10;
      int dur = (recIdx + 3 < args.Length) ? int.Parse(args[recIdx + 3]) : 45;
      string[] parts = size.ToLowerInvariant().Split('x');
      int rw = int.Parse(parts[0]), rh = int.Parse(parts[1]);
      IntPtr rHwnd = FindByTitle(title);
      if (rHwnd == IntPtr.Zero) { Console.Error.WriteLine("window not found: " + title); return 4; }
      if (!IsWindow(rHwnd)) { Console.Error.WriteLine("invalid window"); return 5; }
      return Record(rHwnd, rw, rh, fps, dur);
    }

    string mode = args[0].ToLowerInvariant();
    string key = args[1];
    int idx = 2;
    bool bottom = false;
    if (idx < args.Length && args[idx].ToLowerInvariant() == "-bottom") { bottom = true; idx++; }
    if (idx >= args.Length) { Console.Error.WriteLine("missing outfile"); return 2; }
    string outFile = args[idx++];
    int quality = 85;
    if (idx < args.Length) int.TryParse(args[idx], out quality);

    IntPtr hwnd;
    if (mode == "-hwnd") {
      long hv;
      if (!long.TryParse(key, out hv)) { Console.Error.WriteLine("bad hwnd"); return 3; }
      hwnd = new IntPtr(hv);
    } else if (mode == "-title") {
      hwnd = FindByTitle(key);
      if (hwnd == IntPtr.Zero) { Console.Error.WriteLine("window not found: " + key); return 4; }
    } else {
      Console.Error.WriteLine("unknown mode: " + mode); return 2;
    }
    if (!IsWindow(hwnd)) { Console.Error.WriteLine("invalid window"); return 5; }

    if (bottom) {
      // HWND_BOTTOM = 1
      SetWindowPos(hwnd, (IntPtr)1, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
      System.Threading.Thread.Sleep(150);
    }

    RECT r;
    if (!GetWindowRect(hwnd, out r)) { Console.Error.WriteLine("GetWindowRect failed"); return 6; }
    int w = r.Right - r.Left, h = r.Bottom - r.Top;
    if (w <= 0 || h <= 0) { Console.Error.WriteLine("empty rect " + w + "x" + h); return 7; }

    using (Bitmap bmp = new Bitmap(w, h)) {
      using (Graphics g = Graphics.FromImage(bmp)) {
        IntPtr hdc = g.GetHdc();
        bool ok = PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT);
        g.ReleaseHdc(hdc);
        if (!ok) { Console.Error.WriteLine("PrintWindow failed"); return 8; }
      }
      string ext = System.IO.Path.GetExtension(outFile).ToLowerInvariant();
      if (ext == ".png") {
        bmp.Save(outFile, ImageFormat.Png);
      } else {
        ImageCodecInfo codec = null;
        foreach (ImageCodecInfo c in ImageCodecInfo.GetImageEncoders())
          if (c.MimeType == "image/jpeg") { codec = c; break; }
        var ep = new EncoderParameters(1);
        ep.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, (long)quality);
        bmp.Save(outFile, codec, ep);
      }
    }
    Console.WriteLine("captured {0}x{1}", w, h);
    return 0;
  }

  // record 循环：每帧 PrintWindow → 逐行拷贝 bgr24 → stdout（帧率补偿）
  // 录制窗口全程置底（藏在其他窗口之后），任何情况下不抢前台/不遮挡用户界面
  static int Record(IntPtr hwnd, int w, int h, int fps, int durationSec) {
    if (fps <= 0) fps = 10;
    if (durationSec <= 0) durationSec = 45;
    int frameMs = 1000 / fps;
    int totalFrames = fps * durationSec;
    // 置底 + 不激活（HWND_BOTTOM=1）
    SetWindowPos(hwnd, (IntPtr)1, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
    System.Threading.Thread.Sleep(200);
    var stdout = Console.OpenStandardOutput();
    var rect = new Rectangle(0, 0, w, h);
    byte[] row = new byte[w * 3];
    byte[] frameBytes = new byte[w * h * 3];
    var sw = new System.Diagnostics.Stopwatch();
    using (Bitmap bmp = new Bitmap(w, h, PixelFormat.Format24bppRgb)) {
      using (Graphics g = Graphics.FromImage(bmp)) {
        for (int i = 0; i < totalFrames; i++) {
          if (!IsWindow(hwnd)) break;
          sw.Restart();
          IntPtr hdc = g.GetHdc();
          bool ok = PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT);
          g.ReleaseHdc(hdc);
          if (!ok) break;
          var bd = bmp.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
          try {
            IntPtr p0 = bd.Scan0;
            int dest = 0;
            for (int y = 0; y < h; y++) {
              Marshal.Copy((IntPtr)(p0.ToInt64() + (long)y * bd.Stride), row, 0, w * 3);
              Buffer.BlockCopy(row, 0, frameBytes, dest, w * 3);
              dest += w * 3;
            }
          } finally {
            bmp.UnlockBits(bd);
          }
          stdout.Write(frameBytes, 0, frameBytes.Length);
          stdout.Flush();
          int elapsed = (int)sw.ElapsedMilliseconds;
          int wait = frameMs - elapsed;
          if (wait > 0) System.Threading.Thread.Sleep(wait);
        }
      }
    }
    stdout.Close();
    return 0;
  }
}
