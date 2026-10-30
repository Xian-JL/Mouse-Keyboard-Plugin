using System;
using System.Collections.Generic;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;

namespace MK.Verification {
 public static class HiddenUia {
  public static string Run(){
   var foreground=Native.GetForegroundWindow();var ready=new ManualResetEventSlim(false);Form form=null,other=null;TextBox edit=null,password=null,large=null,readOnly=null;Exception failure=null;
   IntPtr formHandle=IntPtr.Zero,otherHandle=IntPtr.Zero,editHandle=IntPtr.Zero,passwordHandle=IntPtr.Zero,largeHandle=IntPtr.Zero,readOnlyHandle=IntPtr.Zero;
   var thread=new Thread(delegate(){try{
    form=new Form{Text="MK hidden synthetic fixture",ShowInTaskbar=false,Width=400,Height=300};
    edit=new TextBox{Multiline=true,Text="中文😀\r\nsynthetic only",Width=250,Height=70};
    password=new TextBox{UseSystemPasswordChar=true,Text="SYNTHETIC_PASSWORD",Top=80};large=new TextBox{Multiline=true,WordWrap=false,Text=new String('x',20000),Top=120};
    readOnly=new TextBox{ReadOnly=true,Text="synthetic read-only",Top=160};other=new Form{Text="MK hidden unrelated root",ShowInTaskbar=false};
    form.Controls.Add(edit);form.Controls.Add(password);form.Controls.Add(large);form.Controls.Add(readOnly);
    formHandle=form.Handle;otherHandle=other.Handle;editHandle=edit.Handle;passwordHandle=password.Handle;largeHandle=large.Handle;readOnlyHandle=readOnly.Handle;ready.Set();Application.Run();
   }catch(Exception error){failure=error;ready.Set();}});
   thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();
   if(!ready.Wait(6000))throw new Exception("Hidden fixture initialization timed out.");
   if(failure!=null)throw new Exception("Hidden fixture creation failed: "+failure.GetType().Name+" "+failure.Message);
   try{
    if(Native.IsWindowVisible(form.Handle))throw new Exception("Fixture must remain invisible.");
    int budget=16000;var normal=Native.Element(AutomationElement.FromHandle(editHandle),"synthetic-edit",ref budget);
    if(!normal.ContainsKey("value")||!String.Equals(((string)normal["value"]).Replace("\r\n","\n"),"中文😀\nsynthetic only"))throw new Exception("UIA synthetic Unicode read mismatch.");
    if(!Object.Equals(normal["multiline"],"true"))throw new Exception("UIA multiline detection failed.");
    if(!Object.Equals(normal["editable"],true))throw new Exception("Writable editor unexpectedly rejected.");
    budget=16000;var immutable=Native.Element(AutomationElement.FromHandle(readOnlyHandle),"synthetic-read-only",ref budget);
    if(!Object.Equals(immutable["editable"],false))throw new Exception("Read-only editor must not qualify for focus fallback.");
    var element=AutomationElement.FromHandle(editHandle);int pid=System.Diagnostics.Process.GetCurrentProcess().Id;
    if(!Native.BelongsToWindow(element,formHandle,pid)||Native.BelongsToWindow(element,otherHandle,pid)||Native.BelongsToWindow(element,formHandle,pid+1))throw new Exception("UIA window ownership check failed.");
    budget=16000;var secret=Native.Element(AutomationElement.FromHandle(passwordHandle),"synthetic-password",ref budget);
    if(!(bool)secret["password"]||secret.ContainsKey("value"))throw new Exception("Password observation must omit the value.");
    budget=50;var truncated=Native.Element(AutomationElement.FromHandle(largeHandle),"synthetic-long",ref budget);
    if(!truncated.ContainsKey("valueTruncated")||((string)truncated["value"]).Length!=50||budget!=0)throw new Exception("UIA bounded read failed.");
    if(Native.GetForegroundWindow()!=foreground)throw new Exception("Hidden fixture unexpectedly changed foreground.");
    return "{\"ok\":true,\"mode\":\"hidden-synthetic-UIA\",\"unicodeReadMatch\":true,\"multilineDetected\":true,\"readOnlyEditorRefused\":true,\"sameProcessOtherWindowRefused\":true,\"passwordValueOmitted\":true,\"truncationReported\":true,\"foregroundUnchanged\":true,\"visibleWindowsCreated\":false,\"userDesktopObserved\":false,\"inputSent\":false}";
   }finally{
    if(form!=null&&!form.IsDisposed)form.BeginInvoke(new Action(delegate(){if(other!=null)other.Dispose();form.Dispose();Application.ExitThread();}));
    if(!thread.Join(3000))throw new Exception("Hidden UIA fixture did not exit.");
   }
  }
 }
}
