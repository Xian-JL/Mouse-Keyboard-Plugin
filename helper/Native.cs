using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Automation.Text;

namespace MK {
 public class Failure : Exception {
  public readonly string Code, Execution;
  public readonly Dictionary<string,object> Details;
  public Failure(string code, string execution="not_sent",Dictionary<string,object> details=null) : base(code) { Code=code; Execution=execution;Details=details; }
 }
 public static class Native {
  public const long Marker=0x4D4B5031;
  public const int ObservationBudgetMs=2500,UiaBudgetMs=1200;
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left,Top,Right,Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X,Y; }
  [StructLayout(LayoutKind.Sequential)] public struct MSG {public IntPtr hwnd;public uint message;public UIntPtr wParam;public IntPtr lParam;public uint time;public POINT point;public uint lPrivate;}
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {public int dx,dy;public uint mouseData,dwFlags,time;public UIntPtr dwExtraInfo;}
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {public ushort wVk,wScan;public uint dwFlags,time;public UIntPtr dwExtraInfo;}
  [StructLayout(LayoutKind.Explicit)] public struct UNION {[FieldOffset(0)]public MOUSEINPUT mi;[FieldOffset(0)]public KEYBDINPUT ki;}
  [StructLayout(LayoutKind.Sequential)] public struct INPUT {public uint type;public UNION U;}
  [StructLayout(LayoutKind.Sequential)] public struct KBDHOOK {public uint vkCode,scanCode,flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Sequential)] public struct MSHOOK {public POINT point;public uint mouseData,flags,time;public UIntPtr extra;}
  [StructLayout(LayoutKind.Sequential)] public struct GUITHREADINFO {public int cbSize;public uint flags;public IntPtr hwndActive,hwndFocus,hwndCapture,hwndMenuOwner,hwndMoveSize,hwndCaret;public RECT rcCaret;}
  [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {public int cbSize;public RECT monitor,work;public uint flags;}
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO {public uint cbSize;public uint dwTime;}
  public delegate bool EnumWindowsProc(IntPtr hwnd,IntPtr param);
  public delegate IntPtr HookProc(int n,IntPtr w,IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc proc,IntPtr param);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd,out RECT rect);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd,StringBuilder text,int size);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd,uint message,UIntPtr count,StringBuilder text,uint flags,uint timeout,out UIntPtr result);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr hwnd,uint flags);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd,int state);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsHungAppWindow(IntPtr hwnd);
  [DllImport("user32.dll",SetLastError=true)] public static extern bool AttachThreadInput(uint current,uint target,bool attach);
  [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG message,IntPtr hwnd,uint min,uint max,uint remove);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT pt);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT point);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll",SetLastError=true)] public static extern uint SendInput(uint count,INPUT[] input,int size);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO info);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern short VkKeyScanW(char ch);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern short VkKeyScanExW(char ch,IntPtr layout);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern uint MapVirtualKeyExW(uint code,uint mapType,IntPtr layout);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr hwnd,int index);
  [DllImport("user32.dll")] public static extern IntPtr SetWindowLongPtr(IntPtr hwnd,int index,IntPtr value);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd,IntPtr after,int x,int y,int w,int h,uint flags);
  [DllImport("user32.dll")] public static extern bool SetWindowDisplayAffinity(IntPtr hwnd,uint affinity);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] public static extern IntPtr GetThreadDpiAwarenessContext();
  [DllImport("user32.dll")] public static extern bool AreDpiAwarenessContextsEqual(IntPtr first,IntPtr second);
  [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern IntPtr OpenInputDesktop(uint flags,bool inherit,uint access);
  [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr desktop);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern bool GetUserObjectInformation(IntPtr obj,int index,StringBuilder value,int size,out int needed);
  [DllImport("user32.dll")] public static extern bool GetGUIThreadInfo(uint id,ref GUITHREADINFO info);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hwnd,ref POINT point);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromPoint(POINT p,uint flags);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd,uint flags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr monitor,ref MONITORINFO info);
  [DllImport("dwmapi.dll")] public static extern int DwmFlush();
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr hwnd,int attribute,out int value,int size);
  [DllImport("user32.dll")] public static extern IntPtr SetWindowsHookEx(int id,HookProc proc,IntPtr module,uint thread);
  [DllImport("user32.dll")] public static extern bool UnhookWindowsHookEx(IntPtr hook);
  [DllImport("user32.dll")] public static extern IntPtr CallNextHookEx(IntPtr hook,int n,IntPtr w,IntPtr l);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] public static extern IntPtr GetModuleHandle(string name);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr token,int cls,IntPtr data,int size,out int required);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid,uint index);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static Dictionary<string,object> D(params object[] kv) {var d=new Dictionary<string,object>();for(int i=0;i<kv.Length;i+=2)d.Add((string)kv[i],kv[i+1]);return d;}
  public static Dictionary<string,object> Obj(object v) {var d=v as Dictionary<string,object>;if(d==null)throw new Failure("PROTOCOL_ERROR");return d;}
  public static string S(Dictionary<string,object> d,string key) {object v;if(!d.TryGetValue(key,out v)||!(v is string))throw new Failure("PROTOCOL_ERROR");return (string)v;}
  public static int I(Dictionary<string,object>d,string key,int min,int max) {object v;if(!d.TryGetValue(key,out v)||!(v is int||v is long)||Convert.ToInt64(v)<min||Convert.ToInt64(v)>max)throw new Failure("INVALID_ARGUMENT");return Convert.ToInt32(v);}
  public static void Exact(Dictionary<string,object>d,params string[] keys){if(d.Keys.Any(k=>!keys.Contains(k)))throw new Failure("PROTOCOL_ERROR");}
  public static string Clean(string s,int max) {return new string(s.Where(c=>!Char.IsControl(c)).Take(max).ToArray());}
  // Pure accessible-name matcher shared by FR-06 text/element waits and FR-07 element lookup.
  public static bool NameMatch(string value,string pattern,bool exact){if(value==null||pattern==null)return false;return exact?String.Equals(value,pattern,StringComparison.OrdinalIgnoreCase):value.IndexOf(pattern,StringComparison.OrdinalIgnoreCase)>=0;}
  public sealed class ElementLookup {public List<Dictionary<string,object>> Matches;public string Error;public List<Dictionary<string,object>> Candidates;}
  // Pure snapshot element table lookup: contains/exact name plus optional exact role.
  public static ElementLookup FindElements(Dictionary<string,object>[] elements,string name,string role,bool exact){
   var matches=new List<Dictionary<string,object>>();
   foreach(var element in elements??new Dictionary<string,object>[0]){
    if(role!=null&&!Object.Equals(element.ContainsKey("role")?element["role"]:null,role))continue;
    if(!NameMatch(element.ContainsKey("name")?(string)element["name"]:null,name,exact))continue;matches.Add(element);
   }
   if(matches.Count==0)return new ElementLookup{Matches=matches,Error="ELEMENT_NOT_FOUND"};
   if(matches.Count>1){var candidates=new List<Dictionary<string,object>>();foreach(var element in matches.Take(8))candidates.Add(D("ref",Clean(element.ContainsKey("ref")?(string)element["ref"]:"",64),"name",Clean(element.ContainsKey("name")?(string)element["name"]:"",128),"role",Clean(element.ContainsKey("role")?(string)element["role"]:"",64)));return new ElementLookup{Matches=matches,Error="AMBIGUOUS_TARGET",Candidates=candidates};}
   return new ElementLookup{Matches=matches};
  }
  public static string Hwnd(IntPtr h){return h.ToInt64().ToString("x");}
  public static IntPtr ParseHwnd(string h){long v;if(h.Length>16||!Int64.TryParse(h,System.Globalization.NumberStyles.HexNumber,null,out v)||v==0)throw new Failure("TARGET_GONE");return new IntPtr(v);}
  public static Dictionary<string,object> Rect(RECT r){return D("left",r.Left,"top",r.Top,"width",r.Right-r.Left,"height",r.Bottom-r.Top);}
  public static RECT GetRect(IntPtr h){RECT r;if(!GetWindowRect(h,out r)||r.Right<=r.Left||r.Bottom<=r.Top)throw new Failure("TARGET_GONE");return r;}
  public static bool SameRect(RECT a,RECT b){return a.Left==b.Left&&a.Top==b.Top&&a.Right==b.Right&&a.Bottom==b.Bottom;}
  public static void Desktop(){var h=OpenInputDesktop(0,false,1);if(h==IntPtr.Zero)throw new Failure("SECURE_DESKTOP");try{int need;var s=new StringBuilder(256);if(!GetUserObjectInformation(h,2,s,512,out need)||s.ToString()!="Default")throw new Failure("SECURE_DESKTOP");}finally{CloseDesktop(h);}}
  public static void Dpi(){try{SetProcessDpiAwarenessContext(new IntPtr(-4));SetThreadDpiAwarenessContext(new IntPtr(-4));if(!AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(),new IntPtr(-4)))throw new Failure("DPI_UNAVAILABLE");}catch(EntryPointNotFoundException){throw new Failure("UNSUPPORTED_PLATFORM");}}
  static int Integrity(Process p){IntPtr token;if(!OpenProcessToken(p.Handle,8,out token))throw new Failure("NOT_AUTHORIZED");try{int size;GetTokenInformation(token,25,IntPtr.Zero,0,out size);var b=Marshal.AllocHGlobal(size);try{if(!GetTokenInformation(token,25,b,size,out size))throw new Failure("NOT_AUTHORIZED");var sid=Marshal.ReadIntPtr(b);var count=Marshal.ReadByte(GetSidSubAuthorityCount(sid));return Marshal.ReadInt32(GetSidSubAuthority(sid,(uint)(count-1)));}finally{Marshal.FreeHGlobal(b);}}finally{CloseHandle(token);}}
  public static Dictionary<string,object> Window(IntPtr h,int parent){
   if(!IsWindow(h)||!IsWindowVisible(h))throw new Failure("TARGET_GONE");uint pid;GetWindowThreadProcessId(h,out pid);
   using(var p=Process.GetProcessById((int)pid)){
    var title=new StringBuilder(1024);GetWindowText(h,title,1024);var r=GetRect(h);string blocked=null;
    var app=p.ProcessName+".exe";
    if(pid==Process.GetCurrentProcess().Id||pid==parent||p.ProcessName.IndexOf("DeepSeek Harness",StringComparison.OrdinalIgnoreCase)>=0||p.ProcessName.IndexOf("dsh-desktop",StringComparison.OrdinalIgnoreCase)>=0)blocked="NOT_AUTHORIZED";
    if(Integrity(p)>Integrity(Process.GetCurrentProcess()))blocked="NOT_AUTHORIZED";
    var d=D("hwnd",Hwnd(h),"pid",pid,"created",p.StartTime.ToUniversalTime().Ticks.ToString(),"app",Clean(app,100),"title",Clean(title.ToString(),200),"rect",Rect(r),"minimized",IsIconic(h),"foreground",GetForegroundWindow()==h);
    if(blocked!=null)d["blocked"]=blocked;return d;
   }
  }
  // A cloaked UWP child window is real per UIA but paints another window's pixels (F4).
  public static bool Cloaked(IntPtr h){try{int value;if(DwmGetWindowAttribute(h,14,out value,4)!=0)return false;return value!=0;}catch{return false;}}
  public static IntPtr ValidateWindow(Dictionary<string,object>w,int parent,bool foreground,bool allowMinimized=false){
   Desktop();var h=ParseHwnd(S(w,"hwnd"));if(Cloaked(h))throw new Failure("TARGET_GONE");var actual=Window(h,parent);
   if(!Object.Equals(actual["pid"],w["pid"])&&Convert.ToInt64(actual["pid"])!=Convert.ToInt64(w["pid"]))throw new Failure("TARGET_CHANGED");
   if(!Object.Equals(actual["created"],w["created"])||!String.Equals((string)actual["app"],S(w,"app"),StringComparison.OrdinalIgnoreCase))throw new Failure("TARGET_CHANGED");if(actual.ContainsKey("blocked"))throw new Failure("NOT_AUTHORIZED");if(IsIconic(h)&&!allowMinimized)throw new Failure("TARGET_MINIMIZED");if(foreground&&GetForegroundWindow()!=h)throw new Failure("FOCUS_MISMATCH");return h;
  }
  public static bool MatchesQuery(string title,string app,string query,string[] aliases){return query==null||new[]{query}.Concat(aliases??new string[0]).Any(q=>title.IndexOf(q,StringComparison.OrdinalIgnoreCase)>=0||app.IndexOf(q,StringComparison.OrdinalIgnoreCase)>=0);}
  public static Dictionary<string,object> Targets(string query,int parent,string[] aliases=null){
   Desktop();var result=new List<Dictionary<string,object>>();EnumWindows(delegate(IntPtr h,IntPtr unused){try{if(!IsWindowVisible(h))return true;if(Cloaked(h))return true;var w=Window(h,parent);if(String.IsNullOrEmpty((string)w["title"]))return true;if(!MatchesQuery((string)w["title"],(string)w["app"],query,aliases))return true;result.Add(w);}catch{}return true;},IntPtr.Zero);
   result=result.OrderByDescending(w=>(bool)w["foreground"]).ThenBy(w=>Convert.ToInt64(w["pid"])).ThenBy(w=>(string)w["created"]).ThenBy(w=>(string)w["hwnd"],StringComparer.Ordinal).ToList();return D("windows",result.Take(40).ToArray(),"total",result.Count,"truncated",result.Count>40);
  }
  public static POINT Map(int x,int y,RECT rect,int width,int height){if(x<0||y<0||x>=width||y>=height||width<=0||height<=0)throw new Failure("INVALID_COORDINATE");return new POINT{X=rect.Left+(int)Math.Floor((x+.5)*(rect.Right-rect.Left)/width),Y=rect.Top+(int)Math.Floor((y+.5)*(rect.Bottom-rect.Top)/height)};}
  public static INPUT Unicode(char c,bool up){return new INPUT{type=1,U=new UNION{ki=new KEYBDINPUT{wScan=c,dwFlags=(uint)(4|(up?2:0)),dwExtraInfo=new UIntPtr((ulong)Marker)}}};}
  public sealed class ScanKey {public ushort Vk,Scan;public bool Shift,Extended;}
  // Pure planning: never touches the input queue. Null means the active layout needs
  // Ctrl/Alt (never emulated) or cannot produce the character as ASCII at all.
  public static ScanKey Scancode(char c){return Scancode(c,GetKeyboardLayout(0));}
  public static ScanKey Scancode(char c,IntPtr layout){
   if(c>=128)return null;if(c=='\n')return new ScanKey{Vk=13,Scan=28};
   short scan=VkKeyScanExW(c,layout);if(scan==-1)return null;int vk=scan&0xFF,state=(scan>>8)&0xFF;if((state&0xFE)!=0)return null;
   uint physical=MapVirtualKeyExW((uint)vk,4,layout);if(physical==0||(physical>>8)==0xE1)return null;
   return new ScanKey{Vk=(ushort)vk,Shift=(state&1)!=0,Scan=(ushort)(physical&0xFF),Extended=(physical>>8)==0xE0};
  }
  // All-or-nothing: an unmappable character rejects the whole plan before SendInput.
  public static List<ScanKey> ScancodePlan(string text){
   if(String.IsNullOrEmpty(text))throw new Failure("UNSUPPORTED_INPUT","not_sent",D("stage","native-validation","check","scancode-empty"));
   var plan=new List<ScanKey>(text.Length);foreach(char c in text){var key=Scancode(c);if(key==null)throw new Failure("UNSUPPORTED_INPUT","not_sent",D("stage","native-validation","check","scancode-unmappable"));plan.Add(key);}return plan;
  }
  // Shift down first and Shift up last so Send() tracks and ReleaseOwned() can restore vk 16.
  public static INPUT[] ScanInputs(ScanKey key){var list=new List<INPUT>(4);if(key.Shift)list.Add(Key(16,false));foreach(bool up in new[]{false,true})list.Add(new INPUT{type=1,U=new UNION{ki=new KEYBDINPUT{wVk=key.Vk,wScan=key.Scan,dwFlags=(uint)(8|(up?2:0)|(key.Extended?1:0)),dwExtraInfo=new UIntPtr((ulong)Marker)}}});if(key.Shift)list.Add(Key(16,true));return list.ToArray();}
  // FR-01 delivery confirmation: read the global last-input tick, then poll it past the
  // tick captured immediately before SendInput, capped at 300 ms.
  public static uint InputTick(){var info=new LASTINPUTINFO{cbSize=(uint)Marshal.SizeOf(typeof(LASTINPUTINFO))};if(!GetLastInputInfo(ref info))throw new Failure("INPUT_UNKNOWN");return info.dwTime;}
  public static bool WaitInputDelivered(uint before,int budgetMs=300,Action guard=null){
   var watch=Stopwatch.StartNew();for(;;){if(guard!=null)guard();var info=new LASTINPUTINFO{cbSize=(uint)Marshal.SizeOf(typeof(LASTINPUTINFO))};if(GetLastInputInfo(ref info)&&info.dwTime!=before)return true;if(watch.ElapsedMilliseconds>=budgetMs)return false;Thread.Sleep(2);}
  }
  public static INPUT Key(ushort key,bool up){bool extended=key>=33&&key<=40||key==46;return new INPUT{type=1,U=new UNION{ki=new KEYBDINPUT{wVk=key,dwFlags=(uint)((up?2:0)|(extended?1:0)),dwExtraInfo=new UIntPtr((ulong)Marker)}}};}
  public static INPUT Mouse(uint flags,int x=0,int y=0){return new INPUT{type=0,U=new UNION{mi=new MOUSEINPUT{dx=x,dy=y,dwFlags=flags,dwExtraInfo=new UIntPtr((ulong)Marker)}}};}
  public static INPUT Move(POINT p){int l=GetSystemMetrics(76),t=GetSystemMetrics(77),w=GetSystemMetrics(78),h=GetSystemMetrics(79);if(w<=0||h<=0)throw new Failure("INVALID_COORDINATE");return Mouse(0xC001,Math.Min(65535,(int)Math.Floor((p.X-l+.5)*65536/w)),Math.Min(65535,(int)Math.Floor((p.Y-t+.5)*65536/h)));}
  public static ushort[] Keys(string key){var dict=new Dictionary<string,ushort>{{"Enter",13},{"Tab",9},{"Escape",27},{"Backspace",8},{"Delete",46},{"Left",37},{"Up",38},{"Right",39},{"Down",40},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34},{"A",65},{"S",83}};var allowed=new[]{"Enter","Tab","Shift+Tab","Escape","Backspace","Delete","Left","Right","Up","Down","Home","End","PageUp","PageDown","Ctrl+A","Ctrl+S","Ctrl+Home","Ctrl+End"};if(!allowed.Contains(key))throw new Failure("UNSUPPORTED_INPUT");var parts=key.Split('+');return parts.Length==1?new[]{dict[key]}:new[]{(ushort)(parts[0]=="Ctrl"?17:16),dict[parts[1]]};}
  public static string ValidateText(string value){if(String.IsNullOrEmpty(value)||Encoding.UTF8.GetByteCount(value)>65536)throw new Failure("UNSUPPORTED_INPUT");int points=0;for(int i=0;i<value.Length;i++){char c=value[i];if(Char.IsHighSurrogate(c)){if(i+1>=value.Length||!Char.IsLowSurrogate(value[++i]))throw new Failure("UNSUPPORTED_INPUT");}else if(Char.IsLowSurrogate(c))throw new Failure("UNSUPPORTED_INPUT");else if(Char.IsControl(c)&&c!='\n'&&c!='\r')throw new Failure("UNSUPPORTED_INPUT");points++;}if(points>16000)throw new Failure("UNSUPPORTED_INPUT");return value.Replace("\r\n","\n").Replace('\r','\n');}
  // Pure type preconditions over the observed focused-element dictionary (FR-03):
  // editable is deliberately absent so non-editable/canvas targets are accepted.
  public static string TypeRejection(Dictionary<string,object> focused,string text){
   if(focused==null)return "FOCUS_MISMATCH";
   if(focused.ContainsKey("password")&&Object.Equals(focused["password"],true))return "PASSWORD_FIELD";
   if(String.IsNullOrEmpty(text))return "UNSUPPORTED_INPUT";
   if(text.Contains("\n")&&!Object.Equals(focused.ContainsKey("multiline")?focused["multiline"]:null,"true"))return "MULTILINE_UNCONFIRMED";
   return null;
  }
  public static void NoHeldModifiers(){foreach(int k in new[]{16,17,18,91,92})if((GetAsyncKeyState(k)&0x8000)!=0)throw new Failure("USER_BUSY");}
  public static void NoHeldInputs(){for(int k=1;k<255;k++)if((GetAsyncKeyState(k)&0x8000)!=0)throw new Failure("USER_BUSY","not_sent",D("stage","input-arbitration","check","physical-input-held"));}
  public static void NoHeldInputsExceptOwned(OwnedInputs owned){for(int k=1;k<255;k++)if(!owned.OwnsVirtual(k)&&(GetAsyncKeyState(k)&0x8000)!=0)throw new Failure("USER_BUSY","not_sent",D("stage","input-arbitration","check","physical-input-held"));}
  public static bool ValidGeometry(double left,double top,double width,double height){
   return !Double.IsNaN(left)&&!Double.IsInfinity(left)&&!Double.IsNaN(top)&&!Double.IsInfinity(top)&&!Double.IsNaN(width)&&!Double.IsInfinity(width)&&!Double.IsNaN(height)&&!Double.IsInfinity(height)&&width>0&&width<Int32.MaxValue&&height>0&&height<Int32.MaxValue&&left>Int32.MinValue&&top>Int32.MinValue&&left+width<Int32.MaxValue&&top+height<Int32.MaxValue;
  }
  public static bool HasRect(Dictionary<string,object> element){return element!=null&&element.ContainsKey("rect")&&element["rect"] is Dictionary<string,object>;}
  public static void ObservationBudget(long elapsed,string phase,int limit){if(elapsed>limit)throw new Failure("OBSERVATION_TIMEOUT","not_sent",D("stage","observation","check",phase+"-budget","waitedMs",Math.Min(Int32.MaxValue,elapsed),"requiredAction","reobserve"));}
  public static string Prefix(string value,int limit){int length=Math.Min(value.Length,Math.Max(0,limit));if(length>0&&length<value.Length&&Char.IsHighSurrogate(value[length-1]))length--;return value.Substring(0,length);}
  static string AriaMultiline(string aria){
   if(aria==null)return null;var key=new StringBuilder();var value=new StringBuilder();bool inValue=false,escaped=false,invalid=false;string found=null;
   for(int i=0;i<=aria.Length;i++){char c=i<aria.Length?aria[i]:';';
    if(escaped){if(i==aria.Length||c!='\\'&&c!=';'&&c!='=')invalid=true;(inValue?value:key).Append(c);escaped=false;continue;}
    if(c=='\\'){escaped=true;continue;}
    if(c==';'){if(key.ToString().Trim().Equals("multiline",StringComparison.OrdinalIgnoreCase)){string parsed=value.ToString().Trim().ToLowerInvariant();if(invalid||!inValue||parsed!="true"&&parsed!="false"||found!=null&&found!=parsed)return "unknown";found=parsed;}key.Length=0;value.Length=0;inValue=false;invalid=false;continue;}
    if(c=='='&&!inValue){inValue=true;continue;}(inValue?value:key).Append(c);
   }return found;
  }
  public static string Multiline(bool editable,bool nativeEdit,bool nativeMulti,string aria,string observed){
   if(!editable)return "unknown";if(nativeEdit)return nativeMulti?"true":"false";
   string explicitValue=AriaMultiline(aria);if(explicitValue!=null)return explicitValue;
   var content=observed==null?null:observed.TrimEnd('\r','\n');return content!=null&&(content.IndexOf('\n')>=0||content.IndexOf('\r')>=0)?"true":"unknown";
  }
  public static Dictionary<string,object> Element(AutomationElement e,string reference,ref int budget){
   var c=e.Current;var r=c.BoundingRectangle;object rect=ValidGeometry(r.Left,r.Top,r.Width,r.Height)?D("left",(int)Math.Floor(r.Left),"top",(int)Math.Floor(r.Top),"width",(int)Math.Ceiling(r.Width),"height",(int)Math.Ceiling(r.Height)):null;
   if(c.IsPassword)return D("ref",reference,"runtimeId",String.Join(".",e.GetRuntimeId()),"name","[password]","role",c.ControlType.ProgrammaticName,"rect",rect,"offscreen",c.IsOffscreen,"enabled",c.IsEnabled&&!c.IsOffscreen,"password",true,"editable",false,"multiline","unknown");
   object vp,tp;bool value=e.TryGetCurrentPattern(ValuePattern.Pattern,out vp),text=e.TryGetCurrentPattern(TextPattern.Pattern,out tp);bool textWritable=false;
   if(text&&(c.ControlType==ControlType.Edit||c.ControlType==ControlType.Document)){try{var readOnly=((TextPattern)tp).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);textWritable=readOnly is bool&&!(bool)readOnly;}catch{}}
   bool editable=(value&&!((ValuePattern)vp).Current.IsReadOnly)||textWritable;
   bool nativeEdit=editable&&c.NativeWindowHandle!=0&&c.ClassName.IndexOf("Edit",StringComparison.OrdinalIgnoreCase)>=0;
   string aria=null;try{var property=AutomationProperty.LookupById(30102);if(property!=null)aria=e.GetCurrentPropertyValue(property,true) as string;}catch{}
   var multi=Multiline(editable,nativeEdit,nativeEdit&&(GetWindowLongPtr(new IntPtr(c.NativeWindowHandle),-16).ToInt64()&4)!=0,aria,null);
   var d=D("ref",reference,"runtimeId",String.Join(".",e.GetRuntimeId()),"name",Clean(c.Name,180),"role",c.ControlType.ProgrammaticName,"rect",rect,"offscreen",c.IsOffscreen,"enabled",c.IsEnabled&&!c.IsOffscreen,"password",false,"editable",editable,"multiline",multi);
   if(editable&&budget>0){string v=null;try{
    if(text)v=((TextPattern)tp).DocumentRange.GetText(budget+1);
    else if(nativeEdit){var buffer=new StringBuilder(budget+2);UIntPtr read;if(SendMessageTimeout(new IntPtr(c.NativeWindowHandle),13,new UIntPtr((uint)(budget+2)),buffer,2,75,out read)!=IntPtr.Zero)v=buffer.ToString();}
   }catch{}if(v!=null){string bounded=Prefix(v,budget);d["value"]=bounded;budget-=bounded.Length;if(v.Length>bounded.Length)d["valueTruncated"]=true;if(multi=="unknown")d["multiline"]=Multiline(editable,false,false,aria,bounded);}else d["valueUnavailable"]=true;}
   if(editable&&!d.ContainsKey("value"))d["valueUnavailable"]=true;
   if(text&&d.ContainsKey("value")&&!d.ContainsKey("valueTruncated")){try{int limit=((string)d["value"]).Length+1;var pattern=(TextPattern)tp;var selection=pattern.GetSelection();if(selection.Length==1){var before=pattern.DocumentRange.Clone();before.MoveEndpointByRange(TextPatternRangeEndpoint.End,selection[0],TextPatternRangeEndpoint.Start);int start=before.GetText(limit).Length,end=start+selection[0].GetText(limit).Length;if(start<limit&&end<limit){d["selectionStart"]=start;d["selectionEnd"]=end;}}}catch{}}
   return d;
  }
  // Private Snapshot.Data keeps independent verification evidence. Only a
  // bounded, focus-first projection is delivered to the model and over JSONL.
  public static Dictionary<string,object> CompactObservation(Dictionary<string,object> source,bool expanded=false){
   var output=new Dictionary<string,object>(source);var coverage=new Dictionary<string,object>(Obj(source["coverage"]));output["coverage"]=coverage;
   var focused=source.ContainsKey("focusedElement")?Obj(source["focusedElement"]):null;bool cut=false;int textBudget=expanded?8192:1024,bytes=0,maxBytes=expanded?128*1024:48*1024;
   Func<Dictionary<string,object>,bool,Dictionary<string,object>> project=(element,isFocus)=>{var copy=new Dictionary<string,object>(element);object value;
    if(copy.TryGetValue("value",out value)){var text=(string)value;string preview=Prefix(text,Math.Min(textBudget,isFocus?(expanded?4096:512):(expanded?512:128)));textBudget-=preview.Length;copy["value"]=preview;if(preview.Length<text.Length){copy["valueTruncated"]=true;copy["valuePreview"]=true;cut=true;}}
    return copy;};
   if(focused!=null)output["focusedElement"]=project(focused,true);
   var serializer=new System.Web.Script.Serialization.JavaScriptSerializer();var delivered=new List<Dictionary<string,object>>();
   var all=(Dictionary<string,object>[])source["elements"];
   var ordered=all.OrderByDescending(e=>focused!=null&&Object.Equals(e["ref"],focused["ref"])).ThenByDescending(e=>Object.Equals(e["editable"],true)||new[]{"ControlType.Button","ControlType.MenuItem","ControlType.Hyperlink","ControlType.ComboBox","ControlType.CheckBox","ControlType.RadioButton","ControlType.TabItem"}.Contains((string)e["role"]));
   foreach(var element in ordered){Dictionary<string,object> item;if(focused!=null&&Object.Equals(element["ref"],focused["ref"])){item=new Dictionary<string,object>(element);item.Remove("value");item.Remove("selectionStart");item.Remove("selectionEnd");item["evidenceInFocusedElement"]=true;}else item=project(element,false);
    int size=Encoding.UTF8.GetByteCount(serializer.Serialize(item));if(bytes+size>maxBytes){cut=true;continue;}bytes+=size;delivered.Add(item);}
   output["elements"]=delivered.ToArray();coverage["truncated"]=Object.Equals(coverage["truncated"],true)||delivered.Count<all.Length;coverage["textTruncated"]=Object.Equals(coverage["textTruncated"],true)||cut;coverage["availableElements"]=all.Length;coverage["deliveredElements"]=delivered.Count;output["detail"]=expanded?"expanded":"compact";return output;
  }
  public static string RuntimeId(AutomationElement e){return String.Join(".",e.GetRuntimeId());}
  public static bool BelongsToWindow(AutomationElement e,IntPtr h,int pid){
   if(e==null||e.Current.ProcessId!=pid)return false;
   for(int depth=0;e!=null&&depth<64;depth++,e=TreeWalker.RawViewWalker.GetParent(e)){
    int handle=e.Current.NativeWindowHandle;if(handle!=0)return GetAncestor(new IntPtr(handle),2)==h;
   }return false;
  }
  public static IntPtr ForegroundFocus(IntPtr h){
   var info=new GUITHREADINFO{cbSize=Marshal.SizeOf(typeof(GUITHREADINFO))};
   if(GetForegroundWindow()!=h||!GetGUIThreadInfo(0,ref info)||info.hwndFocus==IntPtr.Zero||GetAncestor(info.hwndFocus,2)!=h)throw new Failure("FOCUS_MISMATCH");return info.hwndFocus;
  }
  // The provider's HasKeyboardFocus flag can disagree with FocusedElement in hosted UI.
  // The fallback still needs the SAME live element, HWND focus and authorized root.
  public static bool FocusEvidence(bool sameElement,bool sameNativeFocus,bool belongs,bool enabled,bool hasKeyboardFocus,bool editable,bool keyboardFocusable){
   return sameElement&&sameNativeFocus&&belongs&&enabled&&(hasKeyboardFocus||(editable&&keyboardFocusable));
  }
  static bool SameElementFields(Dictionary<string,object>a,Dictionary<string,object>b){
   if(!HasRect(a)||!HasRect(b))return false;
   foreach(string key in new[]{"runtimeId","name","role","enabled","password","editable"})if(!a.ContainsKey(key)||!b.ContainsKey(key)||!Object.Equals(a[key],b[key]))return false;
   foreach(var item in new[]{a,b})if(!item.ContainsKey("multiline")||!new[]{"true","false","unknown"}.Contains((string)item["multiline"]))return false;
   if(a.ContainsKey("multiline")&&b.ContainsKey("multiline")&&!Object.Equals(a["multiline"],"unknown")&&!Object.Equals(b["multiline"],"unknown")&&!Object.Equals(a["multiline"],b["multiline"]))return false;
   return true;
  }
  // F5: identity never compares the rect (our own typing moves an editor/caret rect), but keeps
  // every other SameElementState field rule. Bounds are only revalidated on the first chunk.
  public static bool SameElementIdentity(Dictionary<string,object>a,Dictionary<string,object>b){return SameElementFields(a,b);}
  public static bool SameElementState(Dictionary<string,object>a,Dictionary<string,object>b){
   if(!SameElementFields(a,b))return false;
   var x=Obj(a["rect"]);var y=Obj(b["rect"]);return new[]{"left","top","width","height"}.All(k=>Object.Equals(x[k],y[k]));
  }
  public static bool SameEditorContent(Dictionary<string,object>a,Dictionary<string,object>b){
   if(a==null||b==null||!SameElementState(a,b)||!Object.Equals(a["editable"],true)||!Object.Equals(a["password"],false)||!Object.Equals(a["enabled"],true))return false;
   if(a.ContainsKey("valueTruncated")||b.ContainsKey("valueTruncated"))return false;
   foreach(string key in new[]{"value","selectionStart","selectionEnd"})if(!a.ContainsKey(key)||!b.ContainsKey(key)||!Object.Equals(a[key],b[key]))return false;
   int start=Convert.ToInt32(a["selectionStart"]),end=Convert.ToInt32(a["selectionEnd"]);return start==end&&start>=0&&end<=((string)a["value"]).Length;
  }
  public static RECT? NativeCaret(IntPtr h,RECT capture,uint dpi){
   var info=new GUITHREADINFO{cbSize=Marshal.SizeOf(typeof(GUITHREADINFO))};
   if(!GetGUIThreadInfo(0,ref info)||info.hwndCaret==IntPtr.Zero||GetAncestor(info.hwndCaret,2)!=h)return null;
   var p=new POINT{X=info.rcCaret.Left,Y=info.rcCaret.Top};if(!ClientToScreen(info.hwndCaret,ref p))return null;
   int width=info.rcCaret.Right-info.rcCaret.Left,height=info.rcCaret.Bottom-info.rcCaret.Top;
   if(width<1||height<1||width>Math.Ceiling(3*dpi/96.0)||height>Math.Ceiling(48*dpi/96.0))return null;
   var r=new RECT{Left=p.X,Top=p.Y,Right=p.X+width,Bottom=p.Y+height};
   if(r.Left<capture.Left||r.Top<capture.Top||r.Right>capture.Right||r.Bottom>capture.Bottom)return null;return r;
  }
  public sealed class VisualFrame {public int Width,Height;public RECT Capture;public byte[] Pixels;public string Hash;public RECT? Caret;}
  public static VisualFrame Frame(Bitmap image,RECT capture,RECT? caret=null){
   var data=image.LockBits(new Rectangle(0,0,image.Width,image.Height),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);
   try{int stride=image.Width*4;var bytes=new byte[stride*image.Height];for(int row=0;row<image.Height;row++)Marshal.Copy(IntPtr.Add(data.Scan0,row*data.Stride),bytes,row*stride,stride);
    if(caret.HasValue){var r=caret.Value;for(int y=Math.Max(0,r.Top-capture.Top);y<Math.Min(image.Height,r.Bottom-capture.Top);y++)for(int x=Math.Max(0,r.Left-capture.Left);x<Math.Min(image.Width,r.Right-capture.Left);x++){int i=(y*image.Width+x)*4;bytes[i]=bytes[i+1]=bytes[i+2]=0;}}
    using(var sha=SHA256.Create())return new VisualFrame{Width=image.Width,Height=image.Height,Capture=capture,Pixels=bytes,Hash=Convert.ToBase64String(sha.ComputeHash(bytes)),Caret=caret};
   }finally{image.UnlockBits(data);}
  }
  public sealed class VisualComparison {public bool Passed;public Dictionary<string,object> Details;}
  public static VisualComparison CompareFrame(VisualFrame a,VisualFrame b,Dictionary<string,object>before,Dictionary<string,object>after,uint dpi,RECT region){
   var details=D("stage","visual-comparison","space","screen-physical-pixels","region",Rect(region),"dpi",dpi);
   if(a==null||b==null||a.Width!=b.Width||a.Height!=b.Height||!SameRect(a.Capture,b.Capture)){details["check"]="capture-geometry";return new VisualComparison{Passed=false,Details=details};}
   int left=Math.Max(region.Left,a.Capture.Left),top=Math.Max(region.Top,a.Capture.Top),right=Math.Min(region.Right,a.Capture.Right),bottom=Math.Min(region.Bottom,a.Capture.Bottom);
   if(right<=left||bottom<=top){details["check"]="empty-comparison-region";return new VisualComparison{Passed=false,Details=details};}
   int changed=0,significant=0,maxDelta=0,minX=right,minY=bottom,maxX=left-1,maxY=top-1;
   int sigLeft=right,sigTop=bottom,sigRight=left-1,sigBottom=top-1;var rows=new HashSet<int>();
   for(int y=top;y<bottom;y++)for(int x=left;x<right;x++){
    int i=((y-a.Capture.Top)*a.Width+x-a.Capture.Left)*4,delta=0;
    for(int channel=0;channel<3;channel++)delta=Math.Max(delta,Math.Abs(a.Pixels[i+channel]-b.Pixels[i+channel]));
    if(delta==0)continue;changed++;maxDelta=Math.Max(maxDelta,delta);minX=Math.Min(minX,x);minY=Math.Min(minY,y);maxX=Math.Max(maxX,x);maxY=Math.Max(maxY,y);
    if(delta<=2)continue;significant++;sigLeft=Math.Min(sigLeft,x);sigTop=Math.Min(sigTop,y);sigRight=Math.Max(sigRight,x);sigBottom=Math.Max(sigBottom,y);rows.Add(y);
   }
   details["changedPixels"]=changed;details["significantPixels"]=significant;details["maxChannelDelta"]=maxDelta;
   details["diffBbox"]=changed==0?null:Rect(new RECT{Left=minX,Top=minY,Right=maxX+1,Bottom=maxY+1});
   bool caret=false;
   if(significant>0&&SameEditorContent(before,after)&&dpi>=96&&dpi<=960){var r=Obj(before["rect"]);int height=sigBottom-sigTop+1;
    caret=sigLeft>=Convert.ToInt32(r["left"])&&sigTop>=Convert.ToInt32(r["top"])&&sigRight<Convert.ToInt32(r["left"])+Convert.ToInt32(r["width"])&&sigBottom<Convert.ToInt32(r["top"])+Convert.ToInt32(r["height"])&&sigRight-sigLeft+1<=Math.Ceiling(3*dpi/96.0)&&height>=Math.Ceiling(4*dpi/96.0)&&height<=Math.Ceiling(48*dpi/96.0)&&rows.Count==height;
   }
   // A changed/missing system caret rectangle cannot open a blind masking path.
   bool relevantCaret=a.Caret.HasValue&&a.Caret.Value.Right>left&&a.Caret.Value.Left<right&&a.Caret.Value.Bottom>top&&a.Caret.Value.Top<bottom||b.Caret.HasValue&&b.Caret.Value.Right>left&&b.Caret.Value.Left<right&&b.Caret.Value.Bottom>top&&b.Caret.Value.Top<bottom;
   bool sameCaret=!relevantCaret||a.Caret.HasValue==b.Caret.HasValue&&(!a.Caret.HasValue||SameRect(a.Caret.Value,b.Caret.Value));
   bool passed=sameCaret&&(significant==0||caret);details["check"]=!sameCaret?"native-caret-changed":significant==0?"within-channel-tolerance":caret?"bounded-editor-caret":"significant-target-change";
   return new VisualComparison{Passed=passed,Details=details};
  }
  public sealed class PixelVerdict {public bool Matched;public int ChangedPixels;public string Check;}
  // Pure waitFor pixel comparator shared with SelfTest. Stable needs settleSamples frames in a
  // row within the existing 2/255 tolerance; changed compares each frame to the first (baseline).
  public static PixelVerdict PixelWait(VisualFrame[] samples,RECT region,string mode,int settleSamples,int minChangedPixels){
   if(samples==null||samples.Length==0)return new PixelVerdict{Check="no-samples"};
   if(mode=="stable"){
    if(samples.Length<Math.Max(2,settleSamples))return new PixelVerdict{Check="insufficient-samples"};
    for(int i=1;i<samples.Length;i++){var comparison=CompareFrame(samples[i-1],samples[i],null,null,96,region);if(!comparison.Passed)return new PixelVerdict{Check=comparison.Details.ContainsKey("check")?(string)comparison.Details["check"]:"stable-comparison"};}
    return new PixelVerdict{Matched=true,Check="stable"};
   }
   int changed=0;for(int i=1;i<samples.Length;i++){var comparison=CompareFrame(samples[0],samples[i],null,null,96,region);if(!comparison.Details.ContainsKey("significantPixels"))continue;changed=Math.Max(changed,Convert.ToInt32(comparison.Details["significantPixels"]));}
   return new PixelVerdict{Matched=changed>=minChangedPixels,ChangedPixels=changed,Check="changed"};
  }
  public static bool IsElementOrDescendant(AutomationElement expected,AutomationElement hit){string reference=RuntimeId(expected);for(int depth=0;hit!=null&&depth<64;depth++,hit=TreeWalker.RawViewWalker.GetParent(hit))if(RuntimeId(hit)==reference)return true;return false;
  }
  public static Bitmap Capture(IntPtr h,out RECT capture){
   var r=GetRect(h);int l=GetSystemMetrics(76),t=GetSystemMetrics(77),w=GetSystemMetrics(78),height=GetSystemMetrics(79);
   capture=new RECT{Left=Math.Max(r.Left,l),Top=Math.Max(r.Top,t),Right=Math.Min(r.Right,l+w),Bottom=Math.Min(r.Bottom,t+height)};int cw=capture.Right-capture.Left,ch=capture.Bottom-capture.Top;
   if(cw<=0||ch<=0||(long)cw*ch>40000000)throw new Failure("INVALID_COORDINATE");var b=new Bitmap(cw,ch,PixelFormat.Format32bppArgb);try{using(var g=Graphics.FromImage(b))g.CopyFromScreen(capture.Left,capture.Top,0,0,b.Size,CopyPixelOperation.SourceCopy);return b;}catch{b.Dispose();throw;}
  }
  public static Dictionary<string,object> ImageSize(int width,int height,int maxWidth,int maxHeight){double scale=Math.Min(1,Math.Min((double)maxWidth/width,(double)maxHeight/height));return D("width",Math.Max(1,(int)Math.Floor(width*scale)),"height",Math.Max(1,(int)Math.Floor(height*scale)));}
  public static Dictionary<string,object> ImageSize(Bitmap b,int maxWidth,int maxHeight){return ImageSize(b.Width,b.Height,maxWidth,maxHeight);}
  // FR-09 region helpers. Image coordinates are the delivered-image space the model sees;
  // Physical maps them back to the screen pixels of the capture.
  public static RECT ImageRect(Dictionary<string,object> region){
   Exact(region,"left","top","width","height");int left=I(region,"left",Int32.MinValue,Int32.MaxValue),top=I(region,"top",Int32.MinValue,Int32.MaxValue),width=I(region,"width",1,1600),height=I(region,"height",1,1200);
   return new RECT{Left=left,Top=top,Right=left+width,Bottom=top+height};
  }
  public static void Within(RECT region,int width,int height){if(region.Left<0||region.Top<0||region.Right>width||region.Bottom>height||region.Right<=region.Left||region.Bottom<=region.Top)throw new Failure("INVALID_COORDINATE","not_sent",D("stage","native-validation","check","region-bounds"));}
  // F6: a coordinate click whose point lands inside an observed image/canvas element only
  // compares the 12-DIP neighbourhood, so canvas refresh is not treated as target change.
  public static bool PointInImageElement(Dictionary<string,object>[] elements,int x,int y){
   foreach(var element in elements??new Dictionary<string,object>[0]){
    string role=element.ContainsKey("role")?(string)element["role"]:null;if(role==null||!(role=="ControlType.Image"||role.EndsWith(".Image",StringComparison.Ordinal)))continue;
    if(!HasRect(element))continue;var rect=Obj(element["rect"]);
    int left=Convert.ToInt32(rect["left"]),top=Convert.ToInt32(rect["top"]),right=left+Convert.ToInt32(rect["width"]),bottom=top+Convert.ToInt32(rect["height"]);
    if(x>=left&&x<right&&y>=top&&y<bottom)return true;
   }
   return false;
  }
  public static RECT ClampRegion(RECT region,RECT capture){
   var clamped=new RECT{Left=Math.Max(region.Left,capture.Left),Top=Math.Max(region.Top,capture.Top),Right=Math.Min(region.Right,capture.Right),Bottom=Math.Min(region.Bottom,capture.Bottom)};
   if(clamped.Right<=clamped.Left||clamped.Bottom<=clamped.Top)throw new Failure("INVALID_COORDINATE","not_sent",D("stage","native-validation","check","comparison-region"));
   return clamped;
  }
  public static RECT Physical(RECT capture,int deliveredWidth,int deliveredHeight,RECT region){
   int width=capture.Right-capture.Left,height=capture.Bottom-capture.Top;if(width<=0||height<=0||deliveredWidth<=0||deliveredHeight<=0)throw new Failure("INVALID_COORDINATE");
   return new RECT{Left=capture.Left+(int)Math.Floor((double)region.Left*width/deliveredWidth),Top=capture.Top+(int)Math.Floor((double)region.Top*height/deliveredHeight),Right=capture.Left+(int)Math.Floor((double)region.Right*width/deliveredWidth),Bottom=capture.Top+(int)Math.Floor((double)region.Bottom*height/deliveredHeight)};
  }
  public static Bitmap CropDelivered(Bitmap source,int deliveredWidth,int deliveredHeight,RECT region){
   int width=region.Right-region.Left,height=region.Bottom-region.Top;if(width<=0||height<=0)throw new Failure("INVALID_COORDINATE");
   if(source.Width==deliveredWidth&&source.Height==deliveredHeight)return source.Clone(new Rectangle(region.Left,region.Top,width,height),PixelFormat.Format32bppArgb);
   var cropped=new Bitmap(width,height,PixelFormat.Format32bppArgb);
   try{using(var graphics=Graphics.FromImage(cropped)){graphics.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;graphics.DrawImage(source,new RectangleF(0,0,width,height),new RectangleF((float)region.Left*source.Width/deliveredWidth,(float)region.Top*source.Height/deliveredHeight,(float)width*source.Width/deliveredWidth,(float)height*source.Height/deliveredHeight),GraphicsUnit.Pixel);}return cropped;}catch{cropped.Dispose();throw;}
  }
  public static byte[] PngBytes(Bitmap b){
   using(var memory=new MemoryStream()){b.Save(memory,ImageFormat.Png);var bytes=memory.ToArray();if(bytes.Length>32*1024*1024)throw new Failure("OUTPUT_LIMIT");return bytes;}
  }
  public static Dictionary<string,object> WritePng(byte[] bytes,string path,int width,int height){
   if(path==null||path.Length<8||path.Length>240)throw new Failure("INVALID_ARGUMENT");
   foreach(char c in path)if(c<32||c==127)throw new Failure("INVALID_ARGUMENT");
   if(!(path.Length>2&&Char.IsLetter(path[0])&&path[1]==':')&&!path.StartsWith("\\\\"))throw new Failure("INVALID_ARGUMENT");
   if(!path.EndsWith(".png",StringComparison.OrdinalIgnoreCase))throw new Failure("INVALID_ARGUMENT");
   string full;try{full=Path.GetFullPath(path);}catch{throw new Failure("INVALID_ARGUMENT");}
   string dir=Path.GetDirectoryName(full);if(String.IsNullOrEmpty(dir)||!Directory.Exists(dir))throw new Failure("SAVE_FAILED","not_sent",D("stage","native-validation","check","save-directory"));
   if(File.Exists(full))throw new Failure("SAVE_EXISTS","not_sent",D("stage","native-validation","check","save-target-exists"));
   File.WriteAllBytes(full,bytes);return D("path",full,"width",width,"height",height,"bytes",bytes.Length);
  }
  public static Dictionary<string,object> Encoded(Bitmap b,int maxWidth,int maxHeight){
   double scale=Math.Min(1,Math.Min((double)maxWidth/b.Width,(double)maxHeight/b.Height));for(int attempt=0;attempt<5;attempt++){
    int w=Math.Max(1,(int)Math.Floor(b.Width*scale)),h=Math.Max(1,(int)Math.Floor(b.Height*scale));using(var resized=new Bitmap(w,h,PixelFormat.Format32bppArgb)){using(var g=Graphics.FromImage(resized)){g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(b,new Rectangle(0,0,w,h));}using(var memory=new MemoryStream()){resized.Save(memory,ImageFormat.Png);if(memory.Length<=2*1024*1024)return D("png",Convert.ToBase64String(memory.ToArray()),"imageSize",D("width",w,"height",h));}}scale*=.75;
   }throw new Failure("OUTPUT_LIMIT");
  }
  public static string SelfTest(){
   int assertions=0;Action<bool,string> check=delegate(bool ok,string name){if(!ok)throw new Exception(name);assertions++;};
   check(Marshal.SizeOf(typeof(INPUT))==40,"INPUT layout");
   var p=Map(0,0,new RECT{Left=-200,Top=10,Right=0,Bottom=110},100,50);check(p.X==-199&&p.Y==11,"mapping");
   check(ValidateText("中文\r\n😀")=="中文\n😀","unicode");
   foreach(var k in new[]{"Enter","Ctrl+A","Shift+Tab","Ctrl+S"})check(Keys(k).Length>=1,"keys");
   check((Key(36,false).U.ki.dwFlags&1)!=0&&(Key(36,true).U.ki.dwFlags&3)==3,"extended navigation key");
   try{Keys("Win+R");check(false,"key rejection");}catch(Failure){assertions++;}
   try{ValidateText("\t");check(false,"tab rejection");}catch(Failure){assertions++;}
   var evidence=Path.Combine(Path.GetTempPath(),"mk-selftest-"+Guid.NewGuid().ToString("N")+".png");using(var sample=new Bitmap(4,3)){var bytes=PngBytes(sample);var saved=WritePng(bytes,evidence,4,3);check(File.Exists((string)saved["path"])&&(int)saved["width"]==4&&(int)saved["height"]==3&&(int)saved["bytes"]==bytes.Length,"evidence save");try{WritePng(bytes,evidence,4,3);check(false,"evidence overwrite");}catch(Failure f){check(f.Code=="SAVE_EXISTS","evidence overwrite");}File.Delete(evidence);}
   // Scancode planning genuinely executes layout-aware VkKeyScanExW; counters are computed, not constants.
   var plan=ScancodePlan("PageFaultTest");var flat=new List<INPUT>();foreach(var key in plan)flat.AddRange(ScanInputs(key));
   int at=0,shiftDowns=0,shiftUps=0,pairs=0;bool held=false,ordered=true;
   foreach(var key in plan){
    if(key.Shift){ordered&=at<flat.Count&&KeyIs(flat[at],16,false);if(at<flat.Count&&KeyIs(flat[at],16,false)){shiftDowns++;held=true;}at++;pairs++;}
    ordered&=at+1<flat.Count&&KeyIs(flat[at],key.Vk,false)&&KeyIs(flat[at+1],key.Vk,true);at+=2;
    if(key.Shift){ordered&=at<flat.Count&&KeyIs(flat[at],16,true);if(at<flat.Count&&KeyIs(flat[at],16,true)){shiftUps++;held=false;}at++;}
   }
   check(ordered&&at==flat.Count,"scancode shift order");
   check(pairs==3&&flat.Any(x=>KeyIs(x,16,false))&&flat.Any(x=>KeyIs(x,16,true)),"scancode shift pairs");
   check(!held&&shiftDowns==shiftUps&&shiftUps==pairs,"shift release");
   var upper=Scancode('P');var lower=Scancode('a');var newline=Scancode('\n');
   check(upper!=null&&upper.Shift&&upper.Vk==80,"uppercase shift");
   check(lower!=null&&!lower.Shift&&lower.Vk==65,"lowercase no shift");
   check(newline!=null&&!newline.Shift&&newline.Vk==13,"newline vk");
   check(Scancode('中')==null&&Scancode('é')==null&&Scancode('\uD83D')==null&&Scancode((char)0x80)==null,"non-ascii unmappable");
   int rejected=0;bool rejectedOk=true;foreach(char bad in new[]{'中','é','\uD83D','\u00A0'}){try{ScancodePlan(bad.ToString());rejectedOk=false;}catch(Failure f){if(f.Code=="UNSUPPORTED_INPUT")rejected++;else rejectedOk=false;}}
   check(rejected==4&&rejectedOk,"unmappable plan rejection");
   var nonEditable=D("editable",false,"password",false,"multiline","unknown");
   var password=D("editable",true,"password",true,"multiline","true");
   var unknownMultiline=D("editable",false,"password",false,"multiline","unknown");
   bool nonEditableAccepted=TypeRejection(nonEditable,"PageFaultTest")==null;check(nonEditableAccepted,"non-editable accepted");
   bool passwordRejected=TypeRejection(password,"abc")=="PASSWORD_FIELD";check(passwordRejected,"password rejected");
   bool multilineRejected=TypeRejection(unknownMultiline,"a\nb")=="MULTILINE_UNCONFIRMED";check(multilineRejected,"multiline rejected");
   check(TypeRejection(D("editable",true,"password",false,"multiline","true"),"a\nb")==null,"multiline accepted");
   // Synthetic frames exercise the real waitFor pixel comparator; no window is captured.
   var pixelCapture=new RECT{Left=0,Top=0,Right=16,Bottom=16};
   VisualFrame frameA,frameB,frameChanged;
   using(var a=new Bitmap(16,16))frameA=Frame(a,pixelCapture);
   using(var b=new Bitmap(16,16))frameB=Frame(b,pixelCapture);
   using(var c=new Bitmap(16,16)){for(int i=0;i<64;i++)c.SetPixel(i%16,i/16,Color.White);frameChanged=Frame(c,pixelCapture);}
   bool stable=PixelWait(new[]{frameA,frameB},pixelCapture,"stable",2,64).Matched;
   bool changed=PixelWait(new[]{frameA,frameChanged},pixelCapture,"changed",2,64).Matched;
   bool staticNoChange=!PixelWait(new[]{frameA,frameB},pixelCapture,"changed",2,64).Matched;
   bool changedNotStable=!PixelWait(new[]{frameA,frameChanged},pixelCapture,"stable",2,64).Matched;
   check(stable&&changed&&staticNoChange&&changedNotStable,"pixel wait comparator");
   bool textMatch=NameMatch("All built.","built",false)&&!NameMatch("All built.","built",true)&&NameMatch("All built.","All built.",true)&&!NameMatch(null,"x",false);
   check(textMatch,"text matcher");
   var elements=new[]{D("ref","r1","name","Save","role","ControlType.Button"),D("ref","r2","name","Save as","role","ControlType.Button"),D("ref","r3","name","Open","role","ControlType.MenuItem")};
   var uniqueLookup=FindElements(elements,"Open",null,false);bool elementUnique=uniqueLookup.Error==null&&uniqueLookup.Matches.Count==1&&Object.Equals(uniqueLookup.Matches[0]["ref"],"r3");
   var roleLookup=FindElements(elements,"Save","ControlType.Button",true);bool elementRole=roleLookup.Error==null&&roleLookup.Matches.Count==1&&Object.Equals(roleLookup.Matches[0]["ref"],"r1");
   var ambiguousLookup=FindElements(elements,"Save",null,false);bool elementAmbiguous=ambiguousLookup.Error=="AMBIGUOUS_TARGET"&&ambiguousLookup.Candidates.Count==2;
   var missingLookup=FindElements(elements,"Nope",null,false);bool elementNotFound=missingLookup.Error=="ELEMENT_NOT_FOUND";
   check(elementUnique&&elementRole&&elementAmbiguous&&elementNotFound,"element lookup");
   var many=Enumerable.Range(0,10).Select(i=>D("ref","m"+i,"name","Item "+i,"role","ControlType.ListItem")).ToArray();
   var manyLookup=FindElements(many,"Item",null,false);bool candidatesBounded=manyLookup.Error=="AMBIGUOUS_TARGET"&&manyLookup.Candidates.Count==8;
   check(candidatesBounded,"candidate bound");
   var identityA=D("runtimeId","1.2","name","Terminal","role","ControlType.Edit","rect",D("left",10,"top",20,"width",30,"height",40),"enabled",true,"password",false,"editable",true,"multiline","true");
   var identityB=D("runtimeId","1.2","name","Terminal","role","ControlType.Edit","rect",D("left",200,"top",20,"width",30,"height",40),"enabled",true,"password",false,"editable",true,"multiline","true");
   bool identityIgnoresRect=SameElementIdentity(identityA,identityB);check(identityIgnoresRect,"identity ignores rect");
   bool stateRejectsRect=!SameElementState(identityA,identityB);check(stateRejectsRect,"state rejects rect");
   var canvasElements=new[]{D("ref","c1","name","VM","role","ControlType.Image","rect",D("left",100,"top",100,"width",200,"height",100),"enabled",true,"password",false,"editable",false,"multiline","unknown"),D("ref","c2","name","Run","role","ControlType.Button","rect",D("left",0,"top",0,"width",50,"height",50),"enabled",true,"password",false,"editable",false,"multiline","unknown")};
   bool canvasHit=PointInImageElement(canvasElements,150,150);
   bool canvasMiss=!PointInImageElement(canvasElements,50,150)&&!PointInImageElement(canvasElements,10,10);
   var clamped=ClampRegion(new RECT{Left=-10,Top=-10,Right=40,Bottom=40},new RECT{Left=0,Top=0,Right=100,Bottom=100});
   bool canvasClamped=clamped.Left==0&&clamped.Top==0&&clamped.Right==40&&clamped.Bottom==40;
   check(canvasHit&&canvasMiss&&canvasClamped,"canvas helpers");
   return "{\"ok\":true,\"mode\":\"compile-and-pure-self-test\",\"desktopObserved\":false,\"inputSent\":false,\"assertions\":"+assertions+",\"scancode\":{\"plan\":"+plan.Count+",\"shiftPairs\":"+pairs+",\"rejected\":"+rejected+",\"release\":"+(shiftDowns==pairs&&shiftUps==pairs&&!held?"true":"false")+"},\"typing\":{\"nonEditableAccepted\":"+(nonEditableAccepted?"true":"false")+",\"passwordRejected\":"+(passwordRejected?"true":"false")+",\"multilineRejected\":"+(multilineRejected?"true":"false")+"},\"waitFor\":{\"stable\":"+(stable?"true":"false")+",\"changed\":"+(changed?"true":"false")+",\"textMatch\":"+(textMatch?"true":"false")+",\"elementMatch\":"+(elementUnique?"true":"false")+"},\"elements\":{\"unique\":"+(elementUnique?"true":"false")+",\"ambiguous\":"+(elementAmbiguous?"true":"false")+",\"notFound\":"+(elementNotFound?"true":"false")+",\"candidates\":"+manyLookup.Candidates.Count+"},\"focus\":{\"identityIgnoresRect\":"+(identityIgnoresRect?"true":"false")+",\"stateRejectsRect\":"+(stateRejectsRect?"true":"false")+"},\"canvas\":{\"hit\":"+(canvasHit?"true":"false")+",\"miss\":"+(canvasMiss?"true":"false")+",\"clamped\":"+(canvasClamped?"true":"false")+"}}";
  }
  static bool KeyIs(INPUT input,ushort vk,bool up){return input.type==1&&input.U.ki.wVk==vk&&((input.U.ki.dwFlags&2)!=0)==up;}
 }
}
