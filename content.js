// Load Tesseract.js dynamically
const script = document.createElement('script');
script.src = chrome.runtime.getURL('tesseract.min.js');
document.head.appendChild(script);

let panel, selectionBox, isSelecting = false;
let startX, startY, endX, endY;

window.addEventListener('toggleMcqSolverPanel', () => {
  if (!panel) createPanel();
  else panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

function createPanel() {
  panel = document.createElement('div');
  panel.id = 'mcq-solver-panel';
  panel.style.cssText = `
    position: fixed;
    top: 60px;
    right: 20px;
    width: 350px;
    height: 420px;
    background: #ffffff;
    box-shadow: 0 4px 15px rgba(0,0,0,0.25);
    border-radius: 10px;
    z-index: 999999;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    display: flex;
    flex-direction: column;
  `;

  panel.innerHTML = `
    <div style="background:#007bff; color:white; padding:12px; font-weight:700; font-size:18px; border-radius:10px 10px 0 0; cursor: move;" id="mcq-header">MCQ Solver Lens
      <button id="close-panel" title="Close" style="float:right; background:none; border:none; color:white; font-weight:bold; font-size:18px; cursor:pointer;">×</button>
    </div>
    <div style="padding:10px; flex:1; display:flex; flex-direction:column; gap:10px;">
      <button id="start-selection" style="background:#0d6efd; border:none; color:white; padding:10px; border-radius:6px; font-weight:600; cursor:pointer;">Select MCQ Area</button>
      <textarea id="manualInput" placeholder="Or paste MCQ text here..." style="flex:1; resize:none; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:14px;"></textarea>
      <button id="solve-btn" style="background:#198754; border:none; color:white; padding:12px; border-radius:6px; font-weight:700; font-size:16px; cursor:pointer;">Solve</button>
      <div id="answer" style="margin-top:10px; font-weight:700; font-size:22px; color:#198754; word-wrap: break-word; min-height:60px;"></div>
    </div>
  `;

  document.body.appendChild(panel);

  // Draggable
  const header = panel.querySelector('#mcq-header');
  dragElement(panel, header);

  // Close button
  panel.querySelector('#close-panel').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  // Start selection
  panel.querySelector('#start-selection').addEventListener('click', startSelection);

  // Solve button
  panel.querySelector('#solve-btn').addEventListener('click', () => {
    const manualText = panel.querySelector('#manualInput').value.trim();
    if (manualText) {
      solveMCQ(manualText);
    } else {
      showAnswer('Please select an area or paste MCQ text.', 'red');
    }
  });
}

function dragElement(elmnt, handle) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
    elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
    elmnt.style.right = "auto";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function startSelection() {
  if (isSelecting) return;
  isSelecting = true;

  selectionBox = document.createElement('div');
  selectionBox.style.position = 'fixed';
  selectionBox.style.border = '2px dashed #007bff';
  selectionBox.style.zIndex = 999998;
  selectionBox.style.pointerEvents = 'none';
  document.body.appendChild(selectionBox);

  function mouseDownHandler(e) {
    startX = e.clientX;
    startY = e.clientY;

    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';

    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  function mouseMoveHandler(e) {
    endX = e.clientX;
    endY = e.clientY;

    selectionBox.style.left = Math.min(startX, endX) + 'px';
    selectionBox.style.top = Math.min(startY, endY) + 'px';
    selectionBox.style.width = Math.abs(endX - startX) + 'px';
    selectionBox.style.height = Math.abs(endY - startY) + 'px';
  }

  async function mouseUpHandler(e) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    isSelecting = false;

    const rect = {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY)
    };

    selectionBox.remove();

    try {
      const imageBlob = await captureArea(rect);
      const text = await runOCR(imageBlob);
      panel.querySelector('#manualInput').value = text;
      solveMCQ(text);
    } catch (err) {
      showAnswer('Error during OCR: ' + err.message, 'red');
    }
  }

  document.addEventListener('mousedown', mouseDownHandler, { once: true });
  showAnswer('Drag to select MCQ area on page...', '#007bff');
}

async function captureArea(rect) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ action: 'capture' }, async (response) => {
        if (response && response.dataUrl) {
          const img = new Image();
          img.src = response.dataUrl;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = rect.width;
            canvas.height = rect.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
            canvas.toBlob(blob => resolve(blob));
          };
          img.onerror = () => reject(new Error('Failed to load screenshot image'));
        } else {
          reject(new Error('Failed to capture screenshot'));
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function runOCR(blob) {
  return new Promise((resolve, reject) => {
    if (!window.Tesseract) {
      reject(new Error('Tesseract.js not loaded'));
      return;
    }
    Tesseract.recognize(
      blob,
      'eng',
      { logger: m => console.log(m) }
    ).then(({ data: { text } }) => {
      resolve(text);
    }).catch(reject);
  });
}

async function solveMCQ(text) {
  showAnswer('Solving...', '#007bff');

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY_HERE',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for solving multiple-choice questions.' },
          { role: 'user', content: 'Solve this MCQ and provide only the correct answer in short: ' + text }
        ],
        temperature: 0.2,
        max_tokens: 100
      })
    });
    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      const answer = data.choices[0].message.content.trim();
      showAnswer(answer, '#198754');
    } else {
      showAnswer('No answer found', 'red');
    }
  } catch (error) {
    showAnswer('API Error: ' + error.message, 'red');
  }
}

function showAnswer(message, color = '#198754') {
  if (!panel) return;
  const answerDiv = panel.querySelector('#answer');
  answerDiv.style.color = color;
  answerDiv.textContent = message;
}
