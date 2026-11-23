/* Institutional editorial enhancements: masthead controls and closing-ticker strip. */
(() => {
  "use strict";
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");
  try {
    const saved = localStorage.getItem("market-pulse-theme");
    if (saved === "dark") root.dataset.theme = "dark";
  } catch (_) {}
  function syncButton(){
    if (btn) {
      const isDark = root.dataset.theme === "dark";
      btn.textContent = isDark ? "◐ 淺色版" : "◑ 深色版";
      btn.setAttribute("aria-label",isDark?"切換至淺色版":"切換至深色版");
      btn.setAttribute("aria-pressed",String(isDark));
    }
  }
  if (btn) btn.addEventListener("click", () => {
    const isDark = root.dataset.theme === "dark";
    if (isDark) delete root.dataset.theme;
    else root.dataset.theme = "dark";
    try {localStorage.setItem("market-pulse-theme", isDark?"light":"dark");} catch(_){}
    syncButton();
  });
  syncButton();
  const keys=[["taiex","TAIEX",0],["sp500","S&P 500",0],["nasdaq","NASDAQ",0],["sox","SOX",0],["vix","VIX",2],["usd_twd","USD / TWD",3]];
  const wrap=document.getElementById("ribbonQuotes");
  if(!wrap)return;
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const show=(data) => {
    const p=data?.status==="ok" ? (data.prices||{}) : {};
    wrap.innerHTML=keys.map(([key,name,d])=>{
      const q=p[key];
      if(!q || !Number.isFinite(q.value))return '<div class="ribbon-quote"><div class="sym">'+name+'</div><div class="rline"><strong>—</strong><span class="date">待同步</span></div></div>';
      const val=Number(q.value).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});
      const pct=Number.isFinite(q.pct)?(q.pct>=0?"+":"")+q.pct.toFixed(2)+"%":"—";
      const cl=Number.isFinite(q.change)?(q.change>=0?"positive":"negative"):"";
      return '<div class="ribbon-quote" title="'+esc(q.date||"")+'"><div class="sym">'+name+'</div><div class="rline"><strong>'+val+'</strong><span class="mv '+cl+'">'+pct+'</span></div></div>';
    }).join("");
  };
  show(null);
  if(location.protocol==="file:"||location.protocol==="about:")return;
  fetch("data/latest.json?t="+Date.now(),{cache:"no-store"})
    .then(r=>{if(!r.ok)throw Error("No data");return r.json()})
    .then(show).catch(()=>show(null));
})();
