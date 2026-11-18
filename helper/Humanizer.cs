using System;
using System.Collections.Generic;
using System.Linq;
namespace MK {
 public sealed class OwnedInputs {
  readonly HashSet<string> down=new HashSet<string>();readonly Dictionary<string,Native.INPUT> releases=new Dictionary<string,Native.INPUT>();public int Count {get{return down.Count;}}
  void Forget(string key){down.Remove(key);releases.Remove(key);}
  public void Record(Native.INPUT[] events,int count){if(count<0||count>events.Length)throw new Failure("PROTOCOL_ERROR");for(int i=0;i<count;i++){var e=events[i];if(e.type==1){string key=((e.U.ki.dwFlags&4)!=0?"u:":"v:")+((e.U.ki.dwFlags&4)!=0?e.U.ki.wScan:e.U.ki.wVk);if((e.U.ki.dwFlags&2)!=0)Forget(key);else{down.Add(key);var up=e;up.U.ki.dwFlags|=2;releases[key]=up;}}else if(e.type==0){if((e.U.mi.dwFlags&2)!=0){down.Add("mouse");var up=e;up.U.mi.dwFlags=4;releases["mouse"]=up;}if((e.U.mi.dwFlags&4)!=0)Forget("mouse");}}}
  public bool OwnsVirtual(int key){if(down.Contains("v:"+key)||key==1&&down.Contains("mouse")||key==231&&down.Any(k=>k.StartsWith("u:")))return true;return (key==160||key==161)&&down.Contains("v:16")||(key==162||key==163)&&down.Contains("v:17");}
  public void Release(Func<Native.INPUT,uint> send,Func<int,bool> physical){bool failed=false;foreach(var key in down.ToArray()){if(key=="mouse"?physical(1):key.StartsWith("v:")&&physical(Int32.Parse(key.Substring(2)))){Forget(key);continue;}try{if(send(releases[key])==1)Forget(key);else failed=true;}catch{failed=true;}}if(failed)throw new Failure("CONTROL_CLOSE_FAILED","unknown");}
 }
 public sealed class InputStep {public Native.INPUT[] Inputs;public int DelayBeforeMs;}
 public sealed class KeyUnit {public List<InputStep> Steps=new List<InputStep>();public int Utf16Offset;}
 public sealed class KeyboardPlan {public List<KeyUnit> Units=new List<KeyUnit>();public int DelayMs;}
 public sealed class MotionFrame {public Native.POINT Point;public int DelayBeforeMs;}
 public sealed class MotionPlan {public List<MotionFrame> Frames=new List<MotionFrame>();public Native.POINT Target;public int HoldMs,DelayMs;public bool Overshoot;}
 // Pure plans: no input, timers, idle motion, text editing or injection-marker changes.
 public sealed class Humanizer {
  public const int MaxDelayMs=20000;readonly Random random;
  public Humanizer():this(Guid.NewGuid().GetHashCode()){} public Humanizer(int seed){random=new Random(seed);}
  int Between(int a,int b){return random.Next(a,b+1);} int Triangle(int a,int b){return (int)Math.Round(a+(b-a)*(random.NextDouble()+random.NextDouble())/2);}
  static bool On(string p){return p!="off";} static void Profile(string p){if(p!="off"&&p!="natural"&&p!="slow")throw new Failure("INVALID_ARGUMENT");}
  public static void Budget(int ms){if(ms>MaxDelayMs)throw new Failure("HUMANIZE_BUDGET_EXCEEDED","not_sent",Native.D("stage","humanization","check","duration-budget","plannedDelayMs",ms,"budgetMs",MaxDelayMs,"requiredAction","split-text-or-select-off"));}
  double Normal(){return Math.Sqrt(-2*Math.Log(1-random.NextDouble()))*Math.Cos(2*Math.PI*random.NextDouble());}
  double LogNormal(double median,double sigma){return median*Math.Exp(sigma*Normal());}
  // Down-to-down targets. Burst boundaries supply a separate, bounded heavy tail;
  // sigma=.45 alone cannot produce the tail probabilities in the feedback.
  int Interval(string profile,int? pace,char previous,char next,bool boundary){
   double ms=pace.HasValue?Math.Max(50,Math.Min(800,LogNormal(pace.Value,.3))):Math.Max(50,Math.Min(260,LogNormal(105,.45)));
   if(boundary)ms+=Math.Max(300,Math.Min(700,LogNormal(460,.25)));
   if(random.NextDouble()<.01)ms+=Math.Max(800,Math.Min(1250,LogNormal(950,.15)));
   if(Char.IsWhiteSpace(previous)||Char.IsPunctuation(previous))ms+=Triangle(60,120);
   if(Char.IsUpper(next))ms+=Triangle(30,60);
   return (int)Math.Round(ms*(profile=="slow"?1.6:1));
  }
  List<InputStep> Schedule(Native.INPUT[] inputs,string profile,int gap,bool pair=false){
   var steps=new List<InputStep>();if(!On(profile)||pair){steps.Add(new InputStep{Inputs=inputs,DelayBeforeMs=gap});return steps;}
   for(int i=0;i<inputs.Length;i++){int delay=i==0?gap:0;var prior=i==0?new Native.INPUT():inputs[i-1];var current=inputs[i];bool up=(current.U.ki.dwFlags&2)!=0,priorMod=prior.type==1&&(prior.U.ki.wVk==16||prior.U.ki.wVk==17),mod=current.type==1&&(current.U.ki.wVk==16||current.U.ki.wVk==17);if(i>0)delay=up&&!mod?Between(35,60):priorMod||mod?Between(10,40):Between(10,25);if(profile=="slow"&&i>0)delay=(int)Math.Round(delay*1.2);steps.Add(new InputStep{Inputs=new[]{current},DelayBeforeMs=delay});}return steps;
  }
  public KeyboardPlan Text(string text,string mode,string profile,int? pace,IntPtr layout){
   Profile(profile);if(pace.HasValue&&(pace<0||pace>400))throw new Failure("INVALID_ARGUMENT");if(mode!="auto"&&mode!="unicode"&&mode!="scancode")throw new Failure("INVALID_ARGUMENT");text=Native.ValidateText(text);var result=new KeyboardPlan();
   int burst=Between(3,8),used=0,previousHold=0;char previous='\0';
   for(int offset=0;offset<text.Length;){int start=offset;char c=text[offset++];bool pair=Char.IsHighSurrogate(c);var input=new List<Native.INPUT>();
    if(c=='\n'){input.Add(Native.Key(13,false));input.Add(Native.Key(13,true));}
    else if(mode!="unicode"&&c<128){var key=Native.Scancode(c,layout);if(key==null)throw new Failure("UNSUPPORTED_INPUT","not_sent",Native.D("stage","native-validation","check","scancode-unmappable"));input.AddRange(Native.ScanInputs(key));}
    else{if(mode=="scancode")throw new Failure("UNSUPPORTED_INPUT");input.Add(Native.Unicode(c,false));input.Add(Native.Unicode(c,true));if(pair){char low=text[offset++];input.Add(Native.Unicode(low,false));input.Add(Native.Unicode(low,true));}}
    bool boundary=used==burst;if(boundary){used=0;burst=Between(3,8);}
    int gap=!On(profile)?(start==0?0:pace??0):start==0?(int)Math.Round(Triangle(120,300)*(profile=="slow"?1.6:1)):Math.Max(0,Interval(profile,pace,previous,c,boundary)-previousHold);
    var unit=new KeyUnit{Utf16Offset=start,Steps=Schedule(input.ToArray(),profile,gap,pair)};previousHold=unit.Steps.Skip(1).Sum(s=>s.DelayBeforeMs);previous=c;used++;result.DelayMs+=gap+previousHold;Budget(result.DelayMs);result.Units.Add(unit);
   }return result;
  }
  public KeyboardPlan Key(string key,string profile){Profile(profile);var keys=Native.Keys(key);var input=new List<Native.INPUT>();foreach(var k in keys)input.Add(Native.Key(k,false));foreach(var k in keys.Reverse())input.Add(Native.Key(k,true));var result=new KeyboardPlan();var unit=new KeyUnit{Steps=Schedule(input.ToArray(),profile,On(profile)&&keys.Length>1?Between(30,80):0)};result.DelayMs=unit.Steps.Sum(s=>s.DelayBeforeMs);result.Units.Add(unit);return result;}
  static Native.POINT Clamp(Native.POINT p,Native.RECT r){return new Native.POINT{X=Math.Max(r.Left,Math.Min(r.Right-1,p.X)),Y=Math.Max(r.Top,Math.Min(r.Bottom-1,p.Y))};}
  static double Distance(Native.POINT a,Native.POINT b){return Math.Sqrt(Math.Pow((double)b.X-a.X,2)+Math.Pow((double)b.Y-a.Y,2));} static bool Same(Native.POINT a,Native.POINT b){return a.X==b.X&&a.Y==b.Y;}
  static Native.POINT CurvePoint(Native.POINT from,Native.POINT to,double t,double bend){
   double d=Distance(from,to);if(d<.5)return to;double dx=(double)to.X-from.X,dy=(double)to.Y-from.Y;t=t*t*(3-2*t);double u=1-t;
   return new Native.POINT{X=(int)Math.Round(from.X+dx*t-3*u*t*dy/d*bend*(u+.65*t)),Y=(int)Math.Round(from.Y+dy*t+3*u*t*dx/d*bend*(u+.65*t))};
  }
  static void Arc(List<Native.POINT> points,Native.POINT from,Native.POINT to,double bend,Native.RECT bounds,int samples){for(int i=1;i<=samples;i++){var p=Clamp(CurvePoint(from,to,(double)i/samples,bend),bounds);if(!Same(points[points.Count-1],p))points.Add(p);}}
  public MotionPlan MovePath(Native.POINT from,Native.POINT requested,Native.RECT bounds,Native.RECT targetBounds,string profile,bool jitter){
   Profile(profile);if(bounds.Right<=bounds.Left||bounds.Bottom<=bounds.Top||targetBounds.Right<=targetBounds.Left||targetBounds.Bottom<=targetBounds.Top)throw new Failure("INVALID_COORDINATE");var plan=new MotionPlan{Target=requested};if(!On(profile)){plan.Frames.Add(new MotionFrame{Point=requested});return plan;}
   if(jitter)plan.Target=Clamp(new Native.POINT{X=requested.X+Between(-2,2),Y=requested.Y+Between(-2,2)},targetBounds);
   double distance=Distance(from,plan.Target),angle=random.NextDouble()*Math.PI*2;int radius=Between(10,25);var near=Clamp(new Native.POINT{X=plan.Target.X+(int)Math.Round(Math.Cos(angle)*radius),Y=plan.Target.Y+(int)Math.Round(Math.Sin(angle)*radius)},bounds);
   var end=plan.Target;int amount=Between(3,8);var over=Clamp(new Native.POINT{X=end.X+(int)Math.Round(Math.Cos(angle)*amount),Y=end.Y+(int)Math.Round(Math.Sin(angle)*amount)},targetBounds);plan.Overshoot=random.NextDouble()<.3&&!Same(over,end);
   if(distance<3){plan.Overshoot=false;plan.Frames.Add(new MotionFrame{Point=plan.Target});plan.HoldMs=Between(60,120);plan.DelayMs=plan.HoldMs;return plan;}
   double bend=distance*Math.Max(.03,Math.Min(.15,LogNormal(.07,.3)))*(random.Next(2)==0?-1:1);
   var arc=new List<Native.POINT>{from};Arc(arc,from,near,bend,bounds,128);if(plan.Overshoot){Arc(arc,near,over,0,bounds,24);Arc(arc,over,end,0,bounds,16);}else Arc(arc,near,end,0,bounds,32);
   var lengths=new List<double>{0};for(int i=1;i<arc.Count;i++)lengths.Add(lengths[i-1]+Distance(arc[i-1],arc[i]));double length=lengths[lengths.Count-1];
   double speed=Math.Max(400,Math.Min(1800,LogNormal(900,.45)));
   // 8ms grid (125Hz), independent of distance. Stretch exceptional long paths
   // instead of violating the step-density constraint or replaying old frames.
   int count=Math.Max(76,Math.Max((int)Math.Round(Math.Min(1600,1000*distance/speed)/8),(int)Math.Ceiling(length/10.5)));if(profile=="slow")count=(int)Math.Ceiling(count*1.4);
   Budget(count*8+120);int lastDue=0,segment=1;var prior=from;
   for(int i=1;i<=count;i++){
    double t=(double)i/count,progress=t-.2*Math.Sin(2*Math.PI*t)/(2*Math.PI),wanted=length*progress;while(segment<arc.Count-1&&lengths[segment]<wanted)segment++;
    double span=lengths[segment]-lengths[segment-1],fraction=span>0?(wanted-lengths[segment-1])/span:1;var a=arc[segment-1];var b=arc[segment];var p=Clamp(i==count?end:new Native.POINT{X=(int)Math.Round(a.X+(b.X-a.X)*fraction),Y=(int)Math.Round(a.Y+(b.Y-a.Y)*fraction)},bounds);int due=i*8;
    if(Same(prior,p)&&i<count)continue;plan.Frames.Add(new MotionFrame{Point=p,DelayBeforeMs=due-lastDue});lastDue=due;prior=p;
   }
   plan.HoldMs=Between(60,120);plan.DelayMs=count*8+plan.HoldMs;Budget(plan.DelayMs);return plan;
  }
  // Absolute deadlines absorb validation/rendering overhead rather than adding it
  // after every relative sleep. Late frames are not replayed in a catch-up burst.
  public static void RunMotion(MotionPlan plan,Action<Native.POINT> send,Action<int> pause,Action validate,Func<long> now){
   long start=now(),due=0;bool sent=false;long last=0;
   foreach(var frame in plan.Frames){due+=frame.DelayBeforeMs;validate();bool final=Object.ReferenceEquals(frame,plan.Frames[plan.Frames.Count-1]);long remaining=start+due-now();if(remaining< -16&&!final)continue;if(remaining>0)pause((int)remaining);validate();long at=now();if(sent&&at-last<4&&!final)continue;send(frame.Point);last=at;sent=true;}
  }
  // The same runner is used with an inert sink and virtual clock by regression tests.
  public static void Run(KeyUnit unit,Action<Native.INPUT[]> send,Action<int> pause,Action validate){foreach(var step in unit.Steps){pause(step.DelayBeforeMs);validate();send(step.Inputs);}}
 }
}
