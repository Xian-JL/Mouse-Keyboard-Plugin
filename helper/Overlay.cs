using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using System.ComponentModel;

namespace MK {
 public static class Overlay {
  static Thread thread; static Dispatcher dispatcher; static Window badge,cursor; static TextBlock label;
  static FrameworkElement segment;static Ellipse ripple;static string geometry;static volatile bool visible,capturing;
  static Native.HookProc keyboardProc,mouseProc;static IntPtr keyboardHook,mouseHook;
  static bool hooksActive;
  static PropertyChangedEventHandler systemChanged;
  public static bool Visible {get{return visible&&!capturing;}}
  public static bool Ready {get{return dispatcher!=null;}}
  public static void Start(string path){
   if(dispatcher!=null)return;
   geometry=File.ReadAllText(path);if(geometry.Length>10000)throw new Failure("OVERLAY_UNAVAILABLE");
   var ready=new ManualResetEventSlim(false);Exception failure=null;
   thread=new Thread(delegate(){try{Native.SetThreadDpiAwarenessContext(new IntPtr(-4));dispatcher=Dispatcher.CurrentDispatcher;ready.Set();Dispatcher.Run();}catch(Exception e){failure=e;ready.Set();}});
   thread.IsBackground=true;thread.SetApartmentState(ApartmentState.STA);thread.Start();if(!ready.Wait(3000)||failure!=null)throw new Failure("OVERLAY_UNAVAILABLE");
  }
  static void Invoke(Action action){if(dispatcher==null)throw new Failure("OVERLAY_UNAVAILABLE");if(dispatcher.CheckAccess())action();else {var op=dispatcher.InvokeAsync(action);if(!op.Task.Wait(1500))throw new Failure("OVERLAY_UNAVAILABLE");}}
  static Window Base(double w,double h){return new Window{Width=w,Height=h,WindowStyle=WindowStyle.None,ResizeMode=ResizeMode.NoResize,AllowsTransparency=true,Background=Brushes.Transparent,Topmost=true,ShowActivated=false,ShowInTaskbar=false,Focusable=false,IsHitTestVisible=false};}
  static IntPtr Handle(Window w){return new WindowInteropHelper(w).EnsureHandle();}
  static void Prepare(Window w){var h=Handle(w);long ex=Native.GetWindowLongPtr(h,-20).ToInt64();Native.SetWindowLongPtr(h,-20,new IntPtr(ex|0x20|0x80000|0x8000000|0x80));Native.SetWindowDisplayAffinity(h,0x11);}
  static void Create(){
   if(badge!=null)return;
   var blue=(Brush)new BrushConverter().ConvertFromString("#168BFF");blue.Freeze();
   badge=Base(160,64);var panel=new Grid{Width=160,Height=64};var background=new Border{Background=new SolidColorBrush(Color.FromArgb(245,248,250,252)),CornerRadius=new CornerRadius(10)};panel.Children.Add(background);
   var logo=new System.Windows.Shapes.Path{Data=Geometry.Parse("F0 "+geometry),Fill=blue,Stretch=Stretch.Uniform,Width=28,Height=28,HorizontalAlignment=HorizontalAlignment.Left,VerticalAlignment=VerticalAlignment.Center,Margin=new Thickness(10,0,0,0)};panel.Children.Add(logo);
   var text=new StackPanel{Width=104,HorizontalAlignment=HorizontalAlignment.Left,VerticalAlignment=VerticalAlignment.Center,Margin=new Thickness(46,0,0,0)};
   label=new TextBlock{Text="DSH 电脑使用中",FontSize=12,Foreground=new SolidColorBrush(Color.FromRgb(31,41,55)),TextTrimming=TextTrimming.CharacterEllipsis};
   text.Children.Add(label);text.Children.Add(new TextBlock{Text="Esc 停止",FontSize=10,Foreground=new SolidColorBrush(Color.FromRgb(75,85,99)),Margin=new Thickness(0,2,0,3)});
   var track=new Grid{Width=72,Height=3,ClipToBounds=true,HorizontalAlignment=HorizontalAlignment.Left,Background=new SolidColorBrush(Color.FromRgb(220,232,248))};
   segment=new Border{Width=20,Height=3,Background=blue,HorizontalAlignment=HorizontalAlignment.Left,CornerRadius=new CornerRadius(1.5),RenderTransform=new TranslateTransform()};track.Children.Add(segment);text.Children.Add(track);panel.Children.Add(text);badge.Content=panel;
   cursor=Base(40,48);var canvas=new Canvas{Width=40,Height=48};var arrow=new System.Windows.Shapes.Path{Data=Geometry.Parse("M0,0 L0,24 L6,18 L10,28 L14,26 L10,16 L20,16 Z"),Fill=blue};Canvas.SetLeft(arrow,10);Canvas.SetTop(arrow,10);canvas.Children.Add(arrow);
   ripple=new Ellipse{Width=16,Height=16,Stroke=blue,StrokeThickness=1.5,Opacity=0};Canvas.SetLeft(ripple,2);Canvas.SetTop(ripple,2);canvas.Children.Add(ripple);cursor.Content=canvas;
   Prepare(badge);Prepare(cursor);systemChanged=delegate(object sender,PropertyChangedEventArgs args){if(args.PropertyName=="ClientAreaAnimation"&&segment!=null)Animate();};SystemParameters.StaticPropertyChanged+=systemChanged;
  }
  static void Animate(){try{var transform=(TranslateTransform)segment.RenderTransform;transform.BeginAnimation(TranslateTransform.XProperty,null);if(SystemParameters.ClientAreaAnimation)transform.BeginAnimation(TranslateTransform.XProperty,new DoubleAnimation(-20,72,TimeSpan.FromMilliseconds(1200)){RepeatBehavior=RepeatBehavior.Forever});else transform.X=26;}catch{/* Static logo and state text remain the control indication. */}}
  public static void Show(IntPtr target,Native.POINT point,string stage){
   Invoke(delegate(){if(!Server.InputAllowed)return;Create();label.Text=stage;Animate();
    var r=Native.GetRect(target);var center=new Native.POINT{X=r.Left+(r.Right-r.Left)/2,Y=r.Top+(r.Bottom-r.Top)/2};var monitor=Native.MonitorFromPoint(center,0);if(monitor==IntPtr.Zero)monitor=Native.MonitorFromWindow(target,2);
    var info=new Native.MONITORINFO{cbSize=Marshal.SizeOf(typeof(Native.MONITORINFO))};if(!Native.GetMonitorInfo(monitor,ref info))throw new Failure("OVERLAY_UNAVAILABLE");
    uint dpi=Native.GetDpiForWindow(target);double scale=Math.Max(1,dpi/96.0);int bw=(int)Math.Round(160*scale),bh=(int)Math.Round(64*scale),gap=(int)Math.Round(16*scale);
    int bx=info.work.Right-bw-gap,by=info.work.Bottom-bh-gap;
    if(point.X>=bx-12*scale&&point.X<bx+bw+12*scale&&point.Y>=by-12*scale&&point.Y<by+bh+12*scale)by-=bh+gap;
    bx=Math.Max(info.work.Left,bx);by=Math.Max(info.work.Top,by);
    badge.Show();cursor.Show();Native.SetWindowPos(Handle(badge),new IntPtr(-1),bx,by,bw,bh,0x10);
    Native.SetWindowPos(Handle(cursor),new IntPtr(-1),point.X-(int)Math.Round(10*scale),point.Y-(int)Math.Round(10*scale),(int)Math.Round(40*scale),(int)Math.Round(48*scale),0x10);visible=true;
   });
  }
  public static void ClickFeedback(){Invoke(delegate(){if(!visible||ripple==null)return;ripple.BeginAnimation(UIElement.OpacityProperty,new DoubleAnimation(.8,0,TimeSpan.FromMilliseconds(220)));});}
  public static void Stage(string stage){if(dispatcher==null)return;Invoke(delegate(){if(visible&&label!=null&&Server.InputAllowed)label.Text=stage;});}
  public static void HideIdle(){if(dispatcher==null)return;Invoke(delegate(){visible=false;if(badge!=null)badge.Hide();if(cursor!=null)cursor.Hide();if(segment!=null)((TranslateTransform)segment.RenderTransform).BeginAnimation(TranslateTransform.XProperty,null);});}
  public static void Suspend(){Invoke(delegate(){capturing=true;if(badge!=null)badge.Hide();if(cursor!=null)cursor.Hide();});Native.DwmFlush();}
  public static void Resume(){Invoke(delegate(){capturing=false;if(visible&&Server.InputAllowed){if(badge!=null)badge.Show();if(cursor!=null)cursor.Show();}});}
  public static void Close(){if(dispatcher==null)return;Invoke(delegate(){visible=false;if(systemChanged!=null)SystemParameters.StaticPropertyChanged-=systemChanged;systemChanged=null;if(segment!=null)((TranslateTransform)segment.RenderTransform).BeginAnimation(TranslateTransform.XProperty,null);if(ripple!=null)ripple.BeginAnimation(UIElement.OpacityProperty,null);if(cursor!=null)cursor.Close();if(badge!=null)badge.Close();cursor=null;badge=null;label=null;segment=null;ripple=null;DisableHooksCore();});}
  public static void EnableHooks(){Invoke(delegate(){if(hooksActive)return;
   keyboardProc=delegate(int n,IntPtr w,IntPtr l){if(n>=0&&Server.InputAllowed){var d=(Native.KBDHOOK)Marshal.PtrToStructure(l,typeof(Native.KBDHOOK));int message=w.ToInt32();if(d.extra.ToUInt64()!=(ulong)Native.Marker&&(message==0x100||message==0x104||message==0x101||message==0x105))Server.PhysicalKey((int)d.vkCode,message==0x100||message==0x104,(d.flags&0x12)!=0);}return Native.CallNextHookEx(keyboardHook,n,w,l);};
   mouseProc=delegate(int n,IntPtr w,IntPtr l){if(n>=0&&Server.InputAllowed){var d=(Native.MSHOOK)Marshal.PtrToStructure(l,typeof(Native.MSHOOK));if(d.extra.ToUInt64()!=(ulong)Native.Marker)Server.PhysicalMouse(w.ToInt32(),(d.flags&3)!=0);}return Native.CallNextHookEx(mouseHook,n,w,l);};
   var module=Native.GetModuleHandle(null);keyboardHook=Native.SetWindowsHookEx(13,keyboardProc,module,0);mouseHook=Native.SetWindowsHookEx(14,mouseProc,module,0);
   if(keyboardHook==IntPtr.Zero||mouseHook==IntPtr.Zero){DisableHooksCore();throw new Failure("OVERLAY_UNAVAILABLE");}hooksActive=true;
  });}
  static void DisableHooksCore(){if(keyboardHook!=IntPtr.Zero)Native.UnhookWindowsHookEx(keyboardHook);if(mouseHook!=IntPtr.Zero)Native.UnhookWindowsHookEx(mouseHook);keyboardHook=IntPtr.Zero;mouseHook=IntPtr.Zero;hooksActive=false;keyboardProc=null;mouseProc=null;}
  public static void Dispose(){if(dispatcher==null)return;Close();dispatcher.BeginInvokeShutdown(DispatcherPriority.Send);if(thread!=null)thread.Join(1500);dispatcher=null;thread=null;}
  // Development-only rendering: creates no visible window, captures no desktop and injects no input.
  // This method is NOT present in the model/helper protocol dispatch table.
  public static void RenderPreview(string asset,string directory){
   Start(asset);Invoke(delegate(){Create();foreach(double scale in new[]{1.0,1.25,1.5,2.0}){
    foreach(var item in new[]{Tuple.Create("card",(FrameworkElement)badge.Content,160,64),Tuple.Create("pointer",(FrameworkElement)cursor.Content,40,48)}){
     item.Item2.Measure(new Size(item.Item3,item.Item4));item.Item2.Arrange(new System.Windows.Rect(0,0,item.Item3,item.Item4));item.Item2.UpdateLayout();
     var image=new RenderTargetBitmap((int)Math.Round(item.Item3*scale),(int)Math.Round(item.Item4*scale),96*scale,96*scale,PixelFormats.Pbgra32);image.Render(item.Item2);
     var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(image));using(var file=File.Create(System.IO.Path.Combine(directory,item.Item1+"-"+(int)(scale*100)+".png")))encoder.Save(file);
    }
   }});Dispose();
  }
 }
}
