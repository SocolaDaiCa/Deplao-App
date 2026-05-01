const { ipcRenderer } = require('electron');

const profilesList = document.getElementById('profiles-list');

let servicesUi = [];
const serviceById = {};

async function loadServicesUi() {
  const list = await ipcRenderer.invoke('get-services-ui');
  servicesUi = Array.isArray(list) ? list : [];
  Object.keys(serviceById).forEach((k) => delete serviceById[k]);
  for (const s of servicesUi) serviceById[s.id] = s;
  const sel = document.getElementById('profile-platform-input');
  if (sel) {
    sel.innerHTML = '';
    for (const s of servicesUi) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    }
  }
}

// Load profiles
let profiles = [];
try {
  const saved = localStorage.getItem('mp_profiles');
  if (saved) profiles = JSON.parse(saved);
} catch(e) {}

for (const p of profiles) {
  if (!p.platform) p.platform = 'zalo';
}

if (profiles.length === 0) {
  profiles = [{ id: Date.now().toString(), name: 'Nick 1', partition: 'persist:nick_1', platform: 'zalo' }];
  saveProfiles();
}

let activeProfileId = profiles[0].id;

function saveProfiles() {
  localStorage.setItem('mp_profiles', JSON.stringify(profiles));
}

function renderSidebar() {
  profilesList.innerHTML = '';
  profiles.forEach(p => {
    const btn = document.createElement('div');
    btn.className = `profile-btn ${p.id === activeProfileId ? 'active' : ''}`;
    btn.title = p.name + ' (Click phải để đổi tên/xóa)';
    
    const span = document.createElement('span');
    span.innerText = p.name.charAt(0).toUpperCase();

    const svc = serviceById[p.platform || 'zalo'];
    const defaultIcon = svc && svc.iconPath ? svc.iconPath : null;

    if (p.avatar) {
      const img = document.createElement('img');
      img.src = p.avatar.startsWith('http') ? p.avatar : `file://${p.avatar.replace(/\\/g, '/')}`;
      img.style.width = '100%'; img.style.height = '100%'; img.style.borderRadius = '50%';
      img.style.objectFit = 'cover'; img.style.position = 'absolute'; img.style.top = '0'; img.style.left = '0';
      btn.appendChild(img);
      span.style.display = 'none';
    } else if (defaultIcon) {
      const img = document.createElement('img');
      img.src = `file://${defaultIcon.replace(/\\/g, '/')}`;
      img.style.width = '100%'; img.style.height = '100%'; img.style.borderRadius = '50%';
      img.style.objectFit = 'cover'; img.style.position = 'absolute'; img.style.top = '0'; img.style.left = '0';
      btn.appendChild(img);
      span.style.display = 'none';
    } else {
      btn.appendChild(span);
    }
    
    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.id = `badge-${p.id}`;
    badge.innerText = '0';
    btn.appendChild(badge);
    
    btn.onclick = () => switchProfile(p.id);
    
    btn.oncontextmenu = () => {
      void openModal(p);
    };
    
    profilesList.appendChild(btn);
  });
}

function switchProfile(id) {
  activeProfileId = id;
  renderSidebar();
  const p = profiles.find(x => x.id === id);
  if (p) {
    ipcRenderer.send('switch-profile', p);
  }
}

// Modal Logic
let editingProfile = null;
let tempAvatarPath = null;
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const nameInput = document.getElementById('profile-name-input');
const proxyInput = document.getElementById('profile-proxy-input');
const platformInput = document.getElementById('profile-platform-input');
const avatarPreview = document.getElementById('avatar-preview');
const avatarImg = document.getElementById('avatar-img');
const avatarLetter = document.getElementById('avatar-letter');
const avatarInput = document.getElementById('avatar-input');

async function openModal(profileToEdit = null) {
  await loadServicesUi();
  ipcRenderer.send('set-browserview-visibility', false);
  editingProfile = profileToEdit;
  tempAvatarPath = profileToEdit ? profileToEdit.avatar : null;

  modalTitle.innerText = profileToEdit ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản';
  nameInput.value = profileToEdit ? profileToEdit.name : '';
  proxyInput.value = profileToEdit && profileToEdit.proxy ? profileToEdit.proxy : '';
  const defaultPlatform = (servicesUi[0] && servicesUi[0].id) || 'zalo';
  platformInput.value = profileToEdit && profileToEdit.platform ? profileToEdit.platform : defaultPlatform;
  if (![...platformInput.options].some((o) => o.value === platformInput.value)) {
    platformInput.value = defaultPlatform;
  }
  document.getElementById('modal-delete').style.display = profileToEdit ? 'block' : 'none';

  updateAvatarPreview();
  modalOverlay.style.display = 'flex';
  nameInput.focus();
}

function resolvedPlatformForSave() {
  let platform = platformInput.value;
  if (!platform && platformInput.options && platformInput.options.length > 0) {
    platform = platformInput.options[0].value;
  }
  if (!platform) platform = (servicesUi[0] && servicesUi[0].id) || 'zalo';
  return platform;
}

function updateAvatarPreview() {
  if (tempAvatarPath) {
    avatarImg.src = tempAvatarPath.startsWith('http') ? tempAvatarPath : `file://${tempAvatarPath.replace(/\\/g, '/')}`;
    avatarImg.style.display = 'block';
    avatarLetter.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarLetter.style.display = 'block';
    avatarLetter.innerText = nameInput.value ? nameInput.value.charAt(0).toUpperCase() : '+';
  }
}

nameInput.addEventListener('input', updateAvatarPreview);

avatarPreview.onclick = () => avatarInput.click();
avatarInput.onchange = (e) => {
  if (e.target.files && e.target.files[0]) {
    tempAvatarPath = e.target.files[0].path;
    updateAvatarPreview();
  }
};

document.getElementById('modal-delete').onclick = () => {
  if (!editingProfile) return;
  const action = confirm(`Bạn có chắc chắn muốn XÓA tài khoản [${editingProfile.name}]?`);
  if (action) {
    if (profiles.length <= 1) {
      alert('Phải có ít nhất 1 tài khoản!');
      return;
    }
    profiles = profiles.filter(x => x.id !== editingProfile.id);
    saveProfiles();
    ipcRenderer.send('delete-profile', editingProfile.id);
    if (activeProfileId === editingProfile.id) switchProfile(profiles[0].id);
    modalOverlay.style.display = 'none';
    renderSidebar();
    ipcRenderer.send('set-browserview-visibility', true);
  }
};

document.getElementById('modal-cancel').onclick = () => {
  modalOverlay.style.display = 'none';
  ipcRenderer.send('set-browserview-visibility', true);
};

document.getElementById('modal-save').onclick = () => {
  const name = nameInput.value.trim();
  if (!name) {
    alert('Vui lòng nhập tên tài khoản!');
    return;
  }
  
  if (editingProfile) {
    editingProfile.name = name;
    editingProfile.avatar = tempAvatarPath;
    editingProfile.platform = resolvedPlatformForSave();
    editingProfile.proxy = proxyInput.value.trim();
    ipcRenderer.send('update-profile-settings', editingProfile);
  } else {
    const id = Date.now().toString();
    const p = { id, name, avatar: tempAvatarPath, partition: `persist:nick_${id}`, platform: resolvedPlatformForSave(), proxy: proxyInput.value.trim() };
    profiles.push(p);
    activeProfileId = id;
  }
  
  saveProfiles();
  modalOverlay.style.display = 'none';
  renderSidebar();
  ipcRenderer.send('set-browserview-visibility', true);
  if (!editingProfile) switchProfile(activeProfileId);
};

document.getElementById('btn-add-profile').onclick = () => void openModal();

// Toolbar
let isDarkMode = true;
const toggleDarkMode = () => {
  isDarkMode = !isDarkMode;
  document.body.className = isDarkMode ? 'dark-mode' : 'light-mode';
  document.getElementById('icon-sun').style.display = isDarkMode ? 'none' : 'block';
  document.getElementById('icon-moon').style.display = isDarkMode ? 'block' : 'none';
  ipcRenderer.send('set-theme', isDarkMode);
};
document.getElementById('btn-dark-mode').onclick = toggleDarkMode;
document.getElementById('btn-zoom-in').onclick = () => ipcRenderer.send('zoom-in');
document.getElementById('btn-zoom-out').onclick = () => ipcRenderer.send('zoom-out');
document.getElementById('btn-fs').onclick = () => ipcRenderer.send('toggle-fullscreen');
document.getElementById('btn-pin').onclick = () => {
  const btn = document.getElementById('btn-pin');
  const isPinned = btn.style.opacity === '1';
  btn.style.opacity = isPinned ? '0.4' : '1';
  ipcRenderer.send('toggle-always-on-top');
};
document.getElementById('btn-reload').onclick = () => ipcRenderer.send('reload-page');

// IPC Updates from Main
ipcRenderer.on('update-profile-badge', (event, { id, count }) => {
  const badge = document.getElementById(`badge-${id}`);
  if (badge) {
    badge.innerText = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'block' : 'none';
  }
});

ipcRenderer.on('update-profile-avatar', (event, { id, avatarUrl }) => {
  const p = profiles.find(x => x.id === id);
  if (p) {
    const isAutoAvatar = !p.avatar || p.avatar.includes('graph.facebook.com') || p.avatar.includes('scontent') || p.avatar.includes('fbcdn');
    if (isAutoAvatar && p.avatar !== avatarUrl) {
      p.avatar = avatarUrl;
      saveProfiles();
      renderSidebar();
    }
  }
});

// Init
const settings = ipcRenderer.sendSync('get-settings');
isDarkMode = settings.isDarkMode;
document.body.className = isDarkMode ? 'dark-mode' : 'light-mode';
document.getElementById('icon-sun').style.display = isDarkMode ? 'none' : 'block';
document.getElementById('icon-moon').style.display = isDarkMode ? 'block' : 'none';
if(settings.alwaysOnTop) {
  document.getElementById('btn-pin').style.opacity = '1';
}

loadServicesUi().then(() => {
  renderSidebar();
  switchProfile(activeProfileId);
});
