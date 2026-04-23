// background.js — Service Worker (Manifest V3)
// Handles badge updates and tab state tracking

const tabRooms = new Map(); // tabId -> { roomCode, isHost }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'room_joined') {
    if (tabId) tabRooms.set(tabId, { roomCode: msg.roomCode, isHost: msg.isHost });
    setBadge(tabId, true);
  }

  if (msg.type === 'room_left') {
    if (tabId) tabRooms.delete(tabId);
    setBadge(tabId, false);
  }

  if (msg.type === 'get_tab_room') {
    // popup asks: is the active tab in a room?
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tid = tabs[0]?.id;
      sendResponse(tabRooms.get(tid) || null);
    });
    return true; // keep channel open for async
  }
});

function setBadge(tabId, active) {
  const text = active ? '●' : '';
  const color = active ? '#4CAF88' : '#aaa';
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  tabRooms.delete(tabId);
});
