// Tourist — shared top nav behaviour (dropdowns, mobile menu, sliding blob, dark mode)
(function () {
  var nav = document.getElementById("tnav");
  if (!nav) return;

  var burger = document.getElementById("tnavBurger");
  var drops = nav.querySelectorAll(".tnav-drop");
  var menu = nav.querySelector(".tnav-menu");
  var blob = nav.querySelector(".tnav-blob");

  function closeDrops(except) {
    drops.forEach(function (d) {
      if (d === except) return;
      d.classList.remove("open");
      var b = d.querySelector("button");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }

  // dropdowns (click works for mouse + touch)
  drops.forEach(function (d) {
    var btn = d.querySelector("button");
    if (!btn) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = !d.classList.contains("open");
      closeDrops(d);
      d.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    });
  });
  document.addEventListener("click", function (e) {
    if (!nav.contains(e.target)) closeDrops();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      closeDrops();
      nav.classList.remove("open");
      if (burger) burger.setAttribute("aria-expanded", "false");
    }
  });

  // mobile menu
  if (burger) {
    burger.addEventListener("click", function () {
      var open = !nav.classList.contains("open");
      nav.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
  }

  // sliding highlight blob: follows hover, rests on the active link
  function moveBlob(el) {
    if (!blob || !el || window.innerWidth <= 820) return;
    blob.style.width = el.offsetWidth + "px";
    blob.style.transform = "translateX(" + (el.offsetLeft - menu.offsetLeft) + "px)";
    blob.classList.add("is-visible");
    blob.style.opacity = "1";
  }
  function restBlob() {
    var active = menu && menu.querySelector(".tnav-link.is-active");
    if (active) {
      moveBlob(active);
    } else if (blob) {
      blob.classList.remove("is-visible");
      blob.style.opacity = "0";
      blob.style.width = "0";
    }
  }
  if (menu && blob) {
    menu.querySelectorAll(".tnav-link").forEach(function (l) {
      l.addEventListener("mouseenter", function () { moveBlob(l); });
      l.addEventListener("focus", function () { moveBlob(l); });
    });
    menu.addEventListener("mouseleave", restBlob);
    window.addEventListener("resize", restBlob);
    restBlob();
  }

  // dark mode (only rendered on pages that pass dark=True)
  var themeBtn = document.getElementById("tnavTheme");
  function setTheme(dark) {
    document.body.classList.toggle("dark-mode", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    var cb = document.getElementById("settingsDarkMode");
    if (cb) cb.checked = dark;
  }
  if (themeBtn) {
    var saved = null;
    try { saved = localStorage.getItem("theme"); } catch (e) {}
    setTheme(saved === "dark");
    themeBtn.addEventListener("click", function () {
      setTheme(!document.body.classList.contains("dark-mode"));
    });
  }
})();
