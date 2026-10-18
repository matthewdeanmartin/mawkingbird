import{B as a,d as r}from"./chunk-DDOK6S3K.js";var f=25,d=2e3,i=class n{start=Date.now();buffer=a([]);entries=this.buffer.asReadonly();record(t,e){let o=this.describe(e).slice(0,d),s={at:Date.now()-this.start,source:t,text:o};this.buffer.update(c=>[...c,s].slice(-f))}clear(){this.buffer.set([])}describe(t){if(t instanceof Error){let e=t.stack?`
${t.stack.split(`
`).slice(0,4).join(`
`)}`:"";return`${t.name}: ${t.message}${e}`}if(typeof t=="string")return t;try{return JSON.stringify(t)}catch{return String(t)}}static \u0275fac=function(e){return new(e||n)};static \u0275prov=r({token:n,factory:n.\u0275fac,providedIn:"root"})};export{i as a};
