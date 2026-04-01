chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      const existingPanel = document.getElementById('mcq-solver-panel');
      if (existingPanel) {
        existingPanel.remove();
      } else {
        window.dispatchEvent(new CustomEvent('toggleMcqSolverPanel'));
      }
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'capture') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true; // async response
  }
});
