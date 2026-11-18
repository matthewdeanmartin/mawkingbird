function r(c,o){let n=new Blob([c],{type:"text/csv"}),t=URL.createObjectURL(n),e=document.createElement("a");e.href=t,e.download=o,e.click(),URL.revokeObjectURL(t)}export{r as a};
