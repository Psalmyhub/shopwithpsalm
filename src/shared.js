const WHATSAPP_NUMBER = "2349038513088"; // 09038513088 in international format

function initTheme(){
  const saved = localStorage.getItem("theme");
  const theme = saved || "light";
  document.documentElement.setAttribute("data-theme", theme);
  updateToggleIcon(theme);
}
function toggleTheme(){
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  updateToggleIcon(next);
}
function updateToggleIcon(theme){
  const btn = document.getElementById("themeToggle");
  if(btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

function formatPrice(price){
  if(price === undefined || price === null || price === "") return "";
  const num = Number(price);
  if(isNaN(num)) return price;
  return "₦" + num.toLocaleString();
}

function whatsappOrderLink(productName){
  const msg = `Hi! I'd like to order: ${productName}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

// The live catalog is served from /api/store (backed by Vercel Postgres),
// so every visitor sees the same published products and branding.
async function loadStore(){
  try{
    const res = await fetch("/api/store", {cache:"no-store"});
    if(!res.ok) return {settings:{}, products:[]};
    return await res.json();
  }catch(e){
    return {settings:{}, products:[]};
  }
}

async function saveSettingsRemote(settings){
  const res = await fetch("/api/store", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": localStorage.getItem("adminSecret") || ""
    },
    body: JSON.stringify({action:"saveSettings", settings})
  });
  return res.ok;
}

async function upsertProductRemote(product){
  const res = await fetch("/api/store", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": localStorage.getItem("adminSecret") || ""
    },
    body: JSON.stringify({action:"upsertProduct", product})
  });
  return res.ok;
}

async function deleteProductRemote(id){
  const res = await fetch("/api/store", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-secret": localStorage.getItem("adminSecret") || ""
    },
    body: JSON.stringify({action:"deleteProduct", id})
  });
  return res.ok;
}
