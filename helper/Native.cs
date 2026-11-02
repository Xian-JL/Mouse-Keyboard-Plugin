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
  public static IntPtr ValidateWindow(Dictionary<string,object>w,int parent,bool foreground,bool allowMinimized=false){
   Desktop();var h=ParseHwnd(S(w,"hwnd"));var actual=Window(h,parent);
   if(!Object.Equals(actual["pid"],w["pid"])&&Convert.ToInt64(actual["pid"])!=Convert.ToInt64(w["pid"]))throw new Failure("TARGET_CHANGED");
   if(!Object.Equals(actual["created"],w["created"])||!String.Equals((string)actual["app"],S(w,"app"),StringComparison.OrdinalIgnoreCase))throw new Failure("TARGET_CHANGED");if(actual.ContainsKey("blocked"))throw new Failure("NOT_AUTHORIZED");if(IsIconic(h)&&!allowMinimized)throw new Failure("TARGET_MINIMIZED");if(foreground&&GetForegroundWindow()!=h)throw new Failure("FOCUS_MISMATCH");return h;
  }
  public static bool MatchesQuery(string title,string app,string query,string[] aliases){return query==null||new[]{query}.Concat(aliases??new string[0]).Any(q=>title.IndexOf(q,StringComparison.OrdinalIgnoreCase)>=0||app.IndexOf(q,StringComparison.OrdinalIgnoreCase)>=0);}
  public static Dictionary<string,object> Targets(string query,int parent,string[] aliases=null){
   Desktop();var result=new List<Dictionary<string,object>>();EnumWindows(delegate(IntPtr h,IntPtr unused){try{if(!IsWindowVisible(h))return true;var w=Window(h,parent);if(String.IsNullOrEmpty((string)w["title"]))return true;if(!MatchesQuery((string)w["title"],(string)w["app"],query,aliases))return true;result.Add(w);}catch{}return true;},IntPtr.Zero);
   result=result.OrderByDescending(w=>(bool)w["foreground"]).ThenBy(w=>Convert.ToInt64(w["pid"])).ThenBy(w=>(string)w["created"]).ThenBy(w=>(string)w["hwnd"],StringComparer.Ordinal).ToList();return D("windows",result.Take(40).ToArray(),"total",result.Count,"truncated",result.Count>40);
  }
  public static POINT Map(int x,int y,RECT rect,int width,int height){if(x<0||y<0||x>=width||y>=height||width<=0||height<=0)throw new Failure("INVALID_COORDINATE");return new POINT{X=rect.Left+(int)Math.Floor((x+.5)*(rect.Right-rect.Left)/width),Y=rect.Top+(int)Math.Floor((y+.5)*(rect.Bottom-rect.Top)/height)};}
  public static INPUT Unicode(char c,bool up){return new INPUT{type=1,U=new UNION{ki=new KEYBDINPUT{wScan=c,dwFlags=(uint)(4|(up?2:0)),dwExtraInfo=new UIntPtr((ulong)Marker)}}};}
  public static INPUT Key(ushort key,bool up){bool extended=key>=33&&key<=40||key==46;return new INPUT{type=1,U=new UNION{ki=new KEYBDINPUT{wVk=key,dwFlags=(uint)((up?2:0)|(extended?1:0)),dwExtraInfo=new UIntPtr((ulong)Marker)}}};}
  public static INPUT Mouse(uint flags,int x=0,int y=0){return new INPUT{type=0,U=new UNION{mi=new MOUSEINPUT{dx=x,dy=y,dwFlags=flags,dwExtraInfo=new UIntPtr((ulong)Marker)}}};}
  public static INPUT Move(POINT p){int l=GetSystemMetrics(76),t=GetSystemMetrics(77),w=GetSystemMetrics(78),h=GetSystemMetrics(79);if(w<=0||h<=0)throw new Failure("INVALID_COORDINATE");return Mouse(0xC001,Math.Min(65535,(int)Math.Floor((p.X-l+.5)*65536/w)),Math.Min(65535,(int)Math.Floor((p.Y-t+.5)*65536/h)));}
  public static ushort[] Keys(string key){var dict=new Dictionary<string,ushort>{{"Enter",13},{"Tab",9},{"Escape",27},{"Backspace",8},{"Delete",46},{"Left",37},{"Up",38},{"Right",39},{"Down",40},{"Home",36},{"End",35},{"PageUp",33},{"PageDown",34},{"A",65},{"S",83}};var allowed=new[]{"Enter","Tab","Shift+Tab","Escape","Backspace","Delete","Left","Right","Up","Down","Home","End","PageUp","PageDown","Ctrl+A","Ctrl+S","Ctrl+Home","Ctrl+End"};if(!allowed.Contains(key))throw new Failure("UNSUPPORTED_INPUT");var parts=key.Split('+');return parts.Length==1?new[]{dict[key]}:new[]{(ushort)(parts[0]=="Ctrl"?17:16),dict[parts[1]]};}
  public static string ValidateText(string value){if(String.IsNullOrEmpty(value)||Encoding.UTF8.GetByteCount(value)>65536)throw new Failure("UNSUPPORTED_INPUT");int points=0;for(int i=0;i<value.Length;i++){char c=value[i];if(Char.IsHighSurrogate(c)){if(i+1>=value.Length||!Char.IsLowSurrogate(value[++i]))throw new Failure("UNSUPPORTED_INPUT");}else if(Char.IsLowSurrogate(c))throw new Failure("UNSUPPORTED_INPUT");else if(Char.IsControl(c)&&c!='\n'&&c!='\r')throw new Failure("UNSUPPORTED_INPUT");points++;}if(points>16000)throw new Failure("UNSUPPORTED_INPUT");return value.Replace("\r\n","\n").Replace('\r','\n');}
  public static void NoHeldModifiers(){foreach(int k in new[]{16,17,18,91,92})if((GetAsyncKeyState(k)&0x8000)!=0)throw new Failure("USER_BUSY");}
  public static void NoHeldInputs(){for(int k=1;k<255;k++)if((GetAsyncKeyState(k)&0x8000)!=0)throw new Failure("USER_BUSY","not_sent",D("stage","input-arbitration","check","physical-input-held"));}
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
  public static bool SameElementState(Dictionary<string,object>a,Dictionary<string,object>b){
   if(!HasRect(a)||!HasRect(b))return false;
   foreach(string key in new[]{"runtimeId","name","role","enabled","password","editable"})if(!a.ContainsKey(key)||!b.ContainsKey(key)||!Object.Equals(a[key],b[key]))return false;
   foreach(var item in new[]{a,b})if(!item.ContainsKey("multiline")||!new[]{"true","false","unknown"}.Contains((string)item["multiline"]))return false;
   if(a.ContainsKey("multiline")&&b.ContainsKey("multiline")&&!Object.Equals(a["multiline"],"unknown")&&!Object.Equals(b["multiline"],"unknown")&&!Object.Equals(a["multiline"],b["multiline"]))return false;
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
  public static bool IsElementOrDescendant(AutomationElement expected,AutomationElement hit){
   string reference=RuntimeId(expected);for(int depth=0;hit!=null&&depth<64;depth++,hit=TreeWalker.RawViewWalker.GetParent(hit))if(RuntimeId(hit)==reference)return true;return false;
  }
  public static Bitmap Capture(IntPtr h,out RECT capture){
   var r=GetRect(h);int l=GetSystemMetrics(76),t=GetSystemMetrics(77),w=GetSystemMetrics(78),height=GetSystemMetrics(79);
   capture=new RECT{Left=Math.Max(r.Left,l),Top=Math.Max(r.Top,t),Right=Math.Min(r.Right,l+w),Bottom=Math.Min(r.Bottom,t+height)};int cw=capture.Right-capture.Left,ch=capture.Bottom-capture.Top;
   if(cw<=0||ch<=0||(long)cw*ch>40000000)throw new Failure("INVALID_COORDINATE");var b=new Bitmap(cw,ch,PixelFormat.Format32bppArgb);try{using(var g=Graphics.FromImage(b))g.CopyFromScreen(capture.Left,capture.Top,0,0,b.Size,CopyPixelOperation.SourceCopy);return b;}catch{b.Dispose();throw;}
  }
  public static Dictionary<string,object> ImageSize(Bitmap b,int maxWidth,int maxHeight){double scale=Math.Min(1,Math.Min((double)maxWidth/b.Width,(double)maxHeight/b.Height));return D("width",Math.Max(1,(int)Math.Floor(b.Width*scale)),"height",Math.Max(1,(int)Math.Floor(b.Height*scale)));}
  public static Dictionary<string,object> Encoded(Bitmap b,int maxWidth,int maxHeight){
   double scale=Math.Min(1,Math.Min((double)maxWidth/b.Width,(double)maxHeight/b.Height));for(int attempt=0;attempt<5;attempt++){
    int w=Math.Max(1,(int)Math.Floor(b.Width*scale)),h=Math.Max(1,(int)Math.Floor(b.Height*scale));using(var resized=new Bitmap(w,h,PixelFormat.Format32bppArgb)){using(var g=Graphics.FromImage(resized)){g.InterpolationMode=System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;g.DrawImage(b,new Rectangle(0,0,w,h));}using(var memory=new MemoryStream()){resized.Save(memory,ImageFormat.Png);if(memory.Length<=2*1024*1024)return D("png",Convert.ToBase64String(memory.ToArray()),"imageSize",D("width",w,"height",h));}}scale*=.75;
   }throw new Failure("OUTPUT_LIMIT");
  }
  public static string SelfTest(){
   if(Marshal.SizeOf(typeof(INPUT))!=40)throw new Exception("INPUT layout");
   var p=Map(0,0,new RECT{Left=-200,Top=10,Right=0,Bottom=110},100,50);if(p.X!=-199||p.Y!=11)throw new Exception("mapping");
   if(ValidateText("中文\r\n😀")!="中文\n😀")throw new Exception("unicode");
   foreach(var k in new[]{"Enter","Ctrl+A","Shift+Tab","Ctrl+S"})if(Keys(k).Length<1)throw new Exception("keys");
   if((Key(36,false).U.ki.dwFlags&1)==0||(Key(36,true).U.ki.dwFlags&3)!=3)throw new Exception("extended navigation key");
   try{Keys("Win+R");throw new Exception("key rejection");}catch(Failure){}
   try{ValidateText("\t");throw new Exception("tab rejection");}catch(Failure){}
   return "{\"ok\":true,\"mode\":\"compile-and-pure-self-test\",\"desktopObserved\":false,\"inputSent\":false}";
  }
 }
}
