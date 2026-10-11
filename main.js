if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
  });
}

if ('Notification' in window && 'serviceWorker' in navigator) {
  Notification.requestPermission().then(p => {
    console.log('Permission:', p);
    if (p !== 'granted') {
      console.error("Notifications not allowed")
    }
  });
}

if(window.eruda) eruda.hide();
const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
if(isPWA) {
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
}

const btn = document.querySelector('.btnmenu');
const sidebar = document.querySelector('.sidebar');
const foot = document.querySelector('.foot');
const ufo = document.querySelector('.ufo');
const menuLinks = document.querySelectorAll('.menulist li a'); // sidebar only
const footLinks = document.querySelectorAll('.foot button'); // footer only
const screens = document.querySelectorAll('.screen');
const settingsModal = document.getElementById('settingsModal');
const closeSettings = document.getElementById('closeSettings');
const toast = document.getElementById('toast');
let toastTimeout = null
let settingsChanged = false
showScreen("home");

btn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  btn.classList.toggle('active');
});

function addFonts(id) {
  const s = document.getElementById(id);
  for (let i = 12; i <= 20; i++) {
    s.innerHTML += `<option value="${i}px">${i}px</option>`;
  }
  
  const saved = localStorage.getItem('--base-font-size');
  if (saved) {
    root.style.setProperty('--base-font-size', saved);
    select.value = saved;
  }
  
}

const select = document.getElementById('font_size');
const root = document.documentElement;

select.addEventListener('change', () => {
  const newSize = select.value;
  root.style.setProperty('--base-font-size', newSize);
  localStorage.setItem('--base-font-size', newSize);
});

function moveUFO(target) {
  const footRect = foot.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const ufoWidth = ufo.offsetWidth
  ufo.style.left = `${targetRect.left + targetRect.width / 2 - footRect.left - (ufoWidth / 2)}px`;
}

function showScreen(id) {
  screens.forEach(screen => screen.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

window.addEventListener('load', () => {
  moveUFO(document.querySelector('.foot button[id="services"]'));
});

menuLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    
    if (link.dataset.screen == "settings") return
    
    const screenId = link.dataset.screen || "home";

    if (!screenId || link.classList.contains('disabled') || link.classList.contains('active')) return;
    
    menuLinks.forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    
    sidebar.classList.remove('open');
    btn.classList.remove('active');

    moveUFO(footLinks[0])
    
    showScreen(screenId);
  });
});

footLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    let screenId = link.dataset.screen;
    if (!screenId) return;
    
    if (screenId == "services") {
      menuLinks.forEach(l => {
        if(l.classList.contains("active")) {
          screenId = l.dataset.screen
        }
      });
    }
    
    moveUFO(link);
    showScreen(screenId);
  });
});

function openToast(message) {
  toast.textContent = message.trim()
  toast.classList.add("show")
  setTimeout(() => {
    toast.classList.remove("show")
  } , 1500)
}

function onSwipeRight(element, callback) {
  let startX = 0;
  
  element.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  });

  element.addEventListener('touchend', e => {
    if (startX > 80) {
      return
    }
    let endX = e.changedTouches[0].clientX;
    if(endX - startX > 100) callback();
  });

}

function onSwipeLeft(element, callback) {
  let startX = 0;
  
  element.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
  });

  element.addEventListener('touchend', e => {
    let endX = e.changedTouches[0].clientX;
    if(startX - endX > 30) callback();
    isInsideScroller = false;
  });

}

onSwipeLeft(window , () => {
  if(sidebar.classList.contains("open")) {
    sidebar.classList.remove('open');
    btn.classList.toggle('active');
  }
})
onSwipeRight(window , () => {
  if(!sidebar.classList.contains("open")) {
    sidebar.classList.add('open');
    btn.classList.toggle('active');
  }
})

function openSettings() {
  settingsModal.showModal();
  settingsChanged = false
}

function closeSettingsModal() {
  settingsModal.close();
  if (settingsChanged) {
    openToast("Settings saved")
  }
  return
}

closeSettings.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

const toggleDark = document.getElementById('toggleDark');

function initTheme() {
  const savedTheme = localStorage.getItem('kudi_guard_theme');
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  const isDark = savedTheme === 'dark' || (!savedTheme && systemDark);
  
  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  
  if (toggleDark) toggleDark.checked = isDark;
}

function toggleTheme() {
  const isDark = root.classList.toggle('dark');
  
  localStorage.setItem('kudi_guard_theme', isDark ? 'dark' : 'light');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!localStorage.getItem('kudi_guard_theme')) {
    root.classList.toggle('dark', e.matches);
    if (toggleDark) toggleDark.checked = e.matches;
  }
});

if (toggleDark) {
  toggleDark.addEventListener('change', () => {
    toggleTheme()
    settingsChanged = true
  });
}

const box = document.querySelector('.mic-btn');

let isDragging = false;
let startX = 0;
let startY = 0;
let initialLeft = 0;
let initialTop = 0;

box.addEventListener('touchstart', (e) => {
  isDragging = true;
  
  const touch = e.touches[0];
  startX = touch.clientX;
  startY = touch.clientY;
  
  const rect = box.getBoundingClientRect();
  initialLeft = rect.left;
  initialTop = rect.top;
});

window.addEventListener('touchmove', (e) => {
  if (!isDragging) return;

  const touch = e.touches[0];
  const deltaX = touch.clientX - startX;
  const deltaY = touch.clientY - startY;

  box.style.left = `${initialLeft + deltaX}px`;
  box.style.top = `${initialTop + deltaY}px`;
  
  e.preventDefault(); 
}, { passive: false });

window.addEventListener('touchend', () => {
  isDragging = false;
});


document.addEventListener('DOMContentLoaded', () => {
  initTheme()
  addFonts('font_size');
});