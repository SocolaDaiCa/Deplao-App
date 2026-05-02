<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed, toRaw } from 'vue'
import type { DeplaoApi, ProfilePayload } from './env'

function getDeplao(): DeplaoApi | undefined {
  return typeof window !== 'undefined' ? window.deplao : undefined
}

function zoomIn() {
  getDeplao()?.zoomIn()
}
function zoomOut() {
  getDeplao()?.zoomOut()
}
function toggleFs() {
  getDeplao()?.toggleFullscreen()
}
function reloadPage() {
  getDeplao()?.reloadPage()
}

function onAddProfile() {
  void openModal(null)
}

const STORAGE_KEY = 'deplao_profiles_v1'
const DEFAULT_PLATFORM = 'messenger'

interface Profile {
  id: string
  name: string
  partition: string
  platform: string
  avatar?: string | null
}

const profiles = ref<Profile[]>([])
const activeProfileId = ref('')
const services = ref<{ id: string; name: string }[]>([])
const isDarkMode = ref(true)
const pinOpaque = ref(false)

const modalOpen = ref(false)
const editingProfile = ref<Profile | null>(null)
const modalTitleText = ref('')
const nameInput = ref('')
const selectedPlatform = ref(DEFAULT_PLATFORM)
const appSelectDisabled = ref(false)
const tempAvatarPath = ref<string | null>(null)
const avatarInputRef = ref<HTMLInputElement | null>(null)
const profileNameInputRef = ref<HTMLInputElement | null>(null)
const profileNameError = ref('')

const badgeCounts = ref<Record<string, number>>({})

/** Fallback khi registry/IPC lỗi — tránh combobox rỗng, không thể thêm phiên. */
const serviceOptions = computed(() => {
  if (services.value.length > 0) return services.value
  return [
    { id: 'messenger', name: 'Messenger' },
    { id: 'gmail', name: 'Gmail' },
  ]
})

function loadProfilesFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) profiles.value = JSON.parse(saved) as Profile[]
  } catch {
    /* ignore */
  }
  for (const p of profiles.value) {
    if (!p.platform) p.platform = DEFAULT_PLATFORM
    delete (p as { proxy?: unknown }).proxy
  }
}

function saveProfilesToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.value))
}

function avatarSrcForPreview(pathOrUrl: string | null): string | null {
  if (!pathOrUrl) return null
  return pathOrUrl.startsWith('http') ? pathOrUrl : `file://${pathOrUrl.replace(/\\/g, '/')}`
}

function avatarSrcForProfile(p: Profile): string | null {
  if (!p.avatar) return null
  return p.avatar.startsWith('http') ? p.avatar : `file://${p.avatar.replace(/\\/g, '/')}`
}

function profileLetter(p: Profile): string {
  return p.name.charAt(0).toUpperCase()
}

/** Electron IPC structured clone không serial đúng Vue Proxy — phải gửi object thường (giống `new/renderer.js`). */
function profileForIpc(p: Profile): ProfilePayload {
  const r = toRaw(p)
  const payload: ProfilePayload = {
    id: String(r.id),
    name: r.name,
    partition: r.partition,
    platform: r.platform || DEFAULT_PLATFORM,
  }
  if (r.avatar != null) payload.avatar = r.avatar
  return payload
}

function switchProfile(id: string) {
  activeProfileId.value = id
  const p = profiles.value.find((x) => String(x.id) === String(id))
  const api = getDeplao()
  if (p && api) api.switchProfile(profileForIpc(p))
}

function badgeText(id: string): string {
  const c = badgeCounts.value[id] ?? 0
  return String(c > 9 ? c : c)
}

function badgeVisible(id: string): boolean {
  return (badgeCounts.value[id] ?? 0) > 0
}

watch(isDarkMode, (v) => {
  document.body.className = v ? 'dark-mode' : 'light-mode'
})

async function openModal(profileToEdit: Profile | null = null) {
  editingProfile.value = profileToEdit
  tempAvatarPath.value = profileToEdit ? profileToEdit.avatar ?? null : null

  modalTitleText.value = profileToEdit ? 'Chỉnh sửa phiên' : 'Thêm phiên'
  nameInput.value = profileToEdit ? profileToEdit.name : ''
  profileNameError.value = ''
  appSelectDisabled.value = !!profileToEdit

  try {
    getDeplao()?.setBrowserviewVisibility(false)
  } catch (e) {
    console.error('[DepLao] setBrowserviewVisibility:', e)
  }

  try {
    const api = getDeplao()
    services.value = api ? await api.listServices() : []
  } catch (e) {
    console.error('[DepLao] listServices:', e)
    services.value = []
  }

  if (profileToEdit?.platform) selectedPlatform.value = profileToEdit.platform
  else selectedPlatform.value = DEFAULT_PLATFORM

  modalOpen.value = true
  requestAnimationFrame(() => {
    profileNameInputRef.value?.focus()
  })
}

function closeModal() {
  modalOpen.value = false
  profileNameError.value = ''
  getDeplao()?.setBrowserviewVisibility(true)
}

const previewLetter = computed(() => {
  if (tempAvatarPath.value) return ''
  return nameInput.value ? nameInput.value.charAt(0).toUpperCase() : '+'
})

const previewImgSrc = computed(() => avatarSrcForPreview(tempAvatarPath.value))

function onAvatarFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0] as (File & { path?: string }) | undefined
  if (f?.path) tempAvatarPath.value = f.path
  input.value = ''
}

function saveModal() {
  const name = nameInput.value.trim()
  if (!name) {
    profileNameError.value = 'Nhập tên phiên.'
    return
  }

  profileNameError.value = ''
  const platform = selectedPlatform.value || DEFAULT_PLATFORM
  const wasEditing = editingProfile.value

  if (wasEditing) {
    wasEditing.name = name
    wasEditing.avatar = tempAvatarPath.value
    wasEditing.platform = platform
  } else {
    const id = Date.now().toString()
    profiles.value.push({
      id,
      name,
      avatar: tempAvatarPath.value ?? undefined,
      partition: `persist:session_${id}`,
      platform,
    })
    activeProfileId.value = id
  }

  saveProfilesToStorage()

  if (!wasEditing) switchProfile(activeProfileId.value)
  else switchProfile(wasEditing.id)

  closeModal()
}

function deleteModal() {
  const ed = editingProfile.value
  if (!ed) return
  if (!confirm(`Xóa phiên [${ed.name}]? Session/cookie của nó sẽ mất khi xóa view.`)) return
  if (profiles.value.length <= 1) {
    alert('Cần ít nhất một phiên.')
    return
  }
  profiles.value = profiles.value.filter((x) => x.id !== ed.id)
  saveProfilesToStorage()
  getDeplao()?.deleteProfile(ed.id)
  if (activeProfileId.value === ed.id) switchProfile(profiles.value[0].id)
  closeModal()
}

function toggleDarkMode() {
  isDarkMode.value = !isDarkMode.value
  getDeplao()?.setTheme(isDarkMode.value)
}

function togglePin() {
  pinOpaque.value = !pinOpaque.value
  getDeplao()?.toggleAlwaysOnTop()
}

let unsubBadge: (() => void) | undefined
let unsubAvatar: (() => void) | undefined

onMounted(async () => {
  loadProfilesFromStorage()
  if (profiles.value.length === 0) {
    profiles.value = [
      {
        id: Date.now().toString(),
        name: 'Tài khoản 1',
        partition: 'persist:session_1',
        platform: DEFAULT_PLATFORM,
      },
    ]
    saveProfilesToStorage()
  }
  activeProfileId.value = profiles.value[0].id

  const api = getDeplao()
  if (api) {
    try {
      const s = await api.getSettings()
      isDarkMode.value = s.isDarkMode
      pinOpaque.value = s.alwaysOnTop
    } catch {
      /* ignore */
    }
    try {
      services.value = await api.listServices()
    } catch {
      services.value = []
    }

    unsubBadge = api.onUpdateProfileBadge(({ id, count }) => {
      badgeCounts.value = { ...badgeCounts.value, [id]: count }
    })

    unsubAvatar = api.onUpdateProfileAvatar(({ id, avatarUrl }) => {
      const p = profiles.value.find((x) => x.id === id)
      if (!p) return
      const isAutoAvatar =
        !p.avatar ||
        p.avatar.includes('graph.facebook.com') ||
        p.avatar.includes('scontent') ||
        p.avatar.includes('fbcdn')
      if (isAutoAvatar && p.avatar !== avatarUrl) {
        p.avatar = avatarUrl
        saveProfilesToStorage()
      }
    })

    api.preloadAllProfiles(profiles.value.map(profileForIpc))
  }

  document.body.className = isDarkMode.value ? 'dark-mode' : 'light-mode'

  switchProfile(activeProfileId.value)
})

onUnmounted(() => {
  unsubBadge?.()
  unsubAvatar?.()
})
</script>

<template>
  <div id="sidebar">
    <div
      id="profiles-list"
      style="display: flex; flex-direction: column; align-items: center; width: 100%"
    >
      <div
        v-for="p in profiles"
        :key="p.id"
        class="profile-btn"
        :class="{ active: p.id === activeProfileId }"
        :title="`${p.name} — click để mở session; phải chuột để sửa`"
        @click="switchProfile(p.id)"
        @contextmenu.prevent="openModal(p)"
      >
        <img v-if="avatarSrcForProfile(p)" :src="avatarSrcForProfile(p)!" alt="" />
        <span v-show="!avatarSrcForProfile(p)" style="position: relative; z-index: 1">{{
          profileLetter(p)
        }}</span>
        <div class="badge" :class="{ visible: badgeVisible(p.id) }">{{ badgeText(p.id) }}</div>
      </div>
    </div>

    <button
      type="button"
      class="profile-btn"
      id="btn-add-profile"
      title="Thêm phiên (session riêng)"
      @click.stop.prevent="onAddProfile"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>

    <div class="sidebar-spacer" />

    <button class="tool-btn" id="btn-dark-mode" title="Chế độ tối/sáng" @click="toggleDarkMode">
      <svg
        v-show="isDarkMode"
        id="icon-moon"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <svg
        v-show="!isDarkMode"
        id="icon-sun"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    </button>
    <button class="tool-btn" id="btn-zoom-in" title="Phóng to" @click="zoomIn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
    <button class="tool-btn" id="btn-zoom-out" title="Thu nhỏ" @click="zoomOut">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    </button>
    <button class="tool-btn" id="btn-fs" title="Toàn màn hình" @click="toggleFs">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 3 21 3 21 9" />
        <polyline points="9 21 3 21 3 15" />
        <line x1="21" y1="3" x2="14" y2="10" />
        <line x1="3" y1="21" x2="10" y2="14" />
      </svg>
    </button>
    <button
      class="tool-btn"
      id="btn-pin"
      title="Ghim cửa sổ"
      :style="{ opacity: pinOpaque ? '1' : '0.4' }"
      @click="togglePin"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 17v5" />
        <path
          d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1h.5a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5h-9a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5H8a1 1 0 0 1 1 1z"
        />
      </svg>
    </button>
    <button class="tool-btn" id="btn-reload" title="Tải lại trang" @click="reloadPage">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  </div>

  <div id="modal-overlay" :class="{ open: modalOpen }">
    <div class="modal-box">
      <h3 style="margin-top: 0">{{ modalTitleText }}</h3>
      <label class="modal-label" for="app-select">Ứng dụng</label>
      <select
        id="app-select"
        v-model="selectedPlatform"
        class="modal-select"
        title="Mỗi app có URL riêng; partition vẫn tách theo tài khoản"
        :disabled="appSelectDisabled"
      >
        <option v-for="s in serviceOptions" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: 0">
        <div
          id="avatar-preview"
          style="
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: #3a3b3c;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            border: 2px solid transparent;
          "
          @click="avatarInputRef?.click()"
        >
          <span v-show="!previewImgSrc" id="avatar-letter" style="font-size: 24px; font-weight: bold">{{
            previewLetter
          }}</span>
          <img
            v-show="previewImgSrc"
            id="avatar-img"
            :src="previewImgSrc || undefined"
            alt=""
            style="width: 100%; height: 100%; object-fit: cover"
          />
        </div>
        <div style="font-size: 13px; color: #aaa; cursor: pointer" @click="avatarInputRef?.click()">
          Chọn ảnh đại diện<br />(Tùy chọn)
        </div>
        <input
          ref="avatarInputRef"
          id="avatar-input"
          type="file"
          accept="image/*"
          style="display: none"
          @change="onAvatarFile"
        />
      </div>
      <div class="modal-name-field">
        <input
          id="profile-name-input"
          ref="profileNameInputRef"
          v-model="nameInput"
          type="text"
          class="modal-input"
          autocomplete="off"
          placeholder="Tên hiển thị (VD: Công việc)"
          :aria-invalid="!!profileNameError"
          :aria-describedby="profileNameError ? 'profile-name-error' : undefined"
          @input="profileNameError = ''"
        />
        <p
          v-show="profileNameError"
          id="profile-name-error"
          class="modal-field-error"
          role="alert"
        >
          {{ profileNameError }}
        </p>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <button
          v-show="editingProfile"
          class="modal-btn cancel"
          id="modal-delete"
          style="background: #e74c3c; color: white"
          type="button"
          @click="deleteModal"
        >
          Xóa
        </button>
        <div style="margin-left: auto">
          <button class="modal-btn cancel" id="modal-cancel" type="button" @click="closeModal">Hủy</button>
          <button class="modal-btn save" id="modal-save" type="button" @click="saveModal">Lưu</button>
        </div>
      </div>
    </div>
  </div>
</template>
