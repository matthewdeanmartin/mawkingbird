function s(i){let t=new Set,n=[];for(let r of i){let e=r.reblog?.account??r.account;e&&!t.has(e.id)&&(t.add(e.id),n.push(e))}return n}export{s as a};
