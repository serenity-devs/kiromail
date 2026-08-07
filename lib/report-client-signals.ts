export type EmailClientSignal={client:string|null;device:string|null};

/** Reglas deliberadamente conservadoras y ampliables: un navegador genérico no
 * se presenta como cliente de correo porque esa inferencia sería engañosa. */
const clientRules:{pattern:RegExp;label:string;device?:string|null}[]=[
  {pattern:/GoogleImageProxy/i,label:"Gmail (proxy)",device:null},
  {pattern:/YahooMailProxy/i,label:"Yahoo Mail (proxy)",device:null},
  {pattern:/Microsoft Outlook|MSOffice|Outlook-iOS-Android/i,label:"Microsoft Outlook"},
  {pattern:/Thunderbird/i,label:"Mozilla Thunderbird"},
  {pattern:/AppleMail|Mail\/\d/i,label:"Apple Mail"},
  {pattern:/SamsungMail/i,label:"Samsung Email"},
];

export function classifyEmailClientSignal(userAgent:string):EmailClientSignal {
  const rule=clientRules.find(item=>item.pattern.test(userAgent));
  if(!rule)return{client:null,device:null};
  if(rule.device===null)return{client:rule.label,device:null};
  const device=/iPad|Tablet/i.test(userAgent)?"Tableta":/iPhone|Android.+Mobile|Mobile/i.test(userAgent)?"Móvil":/Windows NT|Macintosh|X11|Linux x86_64/i.test(userAgent)?"Escritorio":null;
  return{client:rule.label,device};
}

export type SignalDimension={
  available:boolean;
  sample_size:number;
  classified:number;
  coverage:number;
  minimum_sample_size:number;
  minimum_group_size:number;
  reason:string|null;
  groups:{name:string;count:number;share:number}[];
};

export function aggregateSignalDimension(values:(string|null)[],minimumSampleSize=20,minimumGroupSize=5):SignalDimension {
  const sampleSize=values.length;
  const classified=values.filter((value):value is string=>Boolean(value));
  const counts=new Map<string,number>();
  for(const value of classified)counts.set(value,(counts.get(value)??0)+1);
  const coverage=sampleSize?classified.length/sampleSize:0;
  const groups=[...counts].filter(([,count])=>count>=minimumGroupSize).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count,share:classified.length?count/classified.length:0}));
  const available=sampleSize>=minimumSampleSize&&coverage>=0.8&&groups.length>0;
  const reason=available?null:sampleSize<minimumSampleSize?`Se necesitan al menos ${minimumSampleSize} señales únicas.`:coverage<0.8?"Menos del 80% de las señales permite una clasificación fiable.":`Ningún grupo alcanza ${minimumGroupSize} señales.`;
  return{available,sample_size:sampleSize,classified:classified.length,coverage,minimum_sample_size:minimumSampleSize,minimum_group_size:minimumGroupSize,reason,groups:available?groups:[]};
}
