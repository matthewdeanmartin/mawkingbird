function c(n){let t=n.acct?.replace(/^@/,"").trim();if(!t)return null;if(t.includes("@"))return t;try{let r=new URL(n.url).host;return r?`${t}@${r}`:null}catch{return null}}export{c as a};
