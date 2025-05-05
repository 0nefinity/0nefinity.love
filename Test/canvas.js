class InfiniteCanvas {
  constructor() {
    // Canvas elements
    this.canvas = document.getElementById('infinite-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimap = document.getElementById('minimap');
    this.minimapCtx = this.minimap.getContext('2d');

    // Canvas state
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.lastX = 0;
    this.lastY = 0;
    this.isDragging = false;
    this.elements = [];
    this.activeElement = null;
    this.currentTool = 'pan'; // Default tool
    this.editMode = false; // Edit mode is disabled by default

    // Grid settings
    this.gridSize = 50;
    this.showGrid = true;

    // Initialize
    this.resizeCanvas();
    this.setupEventListeners();
    this.loadInitialContent();
    this.render();
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.minimap.width = 150;
    this.minimap.height = 150;
    this.render();
  }

  setupEventListeners() {
    // Mouse events for panning
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('mouseleave', this.handleMouseUp.bind(this));

    // Wheel event for zooming
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

    // Window resize
    window.addEventListener('resize', this.resizeCanvas.bind(this));

    // Tool buttons
    document.getElementById('pan-tool').addEventListener('click', () => this.setTool('pan'));
    document.getElementById('edit-tool').addEventListener('click', () => this.toggleEditMode());
    document.getElementById('text-tool').addEventListener('click', () => {
      if (this.editMode) this.setTool('text');
    });
    document.getElementById('shape-tool').addEventListener('click', () => {
      if (this.editMode) this.setTool('shape');
    });

    // Zoom buttons
    document.getElementById('zoom-in').addEventListener('click', () => this.zoom(1.05));
    document.getElementById('zoom-out').addEventListener('click', () => this.zoom(0.95));
    document.getElementById('zoom-reset').addEventListener('click', () => {
      this.scale = 1;
      this.offsetX = 0;
      this.offsetY = 0;
      this.render();
    });

    // Text property controls
    document.getElementById('font-family').addEventListener('change', this.updateTextProperties.bind(this));
    document.getElementById('font-size').addEventListener('input', this.updateTextProperties.bind(this));
    document.getElementById('font-color').addEventListener('input', this.updateTextProperties.bind(this));
  }

  toggleEditMode() {
    this.editMode = !this.editMode;

    // Update UI
    const editButton = document.getElementById('edit-tool');
    if (this.editMode) {
      editButton.classList.add('active');
      document.getElementById('text-tool').removeAttribute('disabled');
      document.getElementById('shape-tool').removeAttribute('disabled');
    } else {
      editButton.classList.remove('active');
      document.getElementById('text-tool').setAttribute('disabled', 'disabled');
      document.getElementById('shape-tool').setAttribute('disabled', 'disabled');
      this.setTool('pan'); // Switch back to pan tool when edit mode is disabled
    }
  }

  handleMouseDown(e) {
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    // Only allow editing if edit mode is enabled
    if (this.editMode) {
      // Check if we're using the text tool
      if (this.currentTool === 'text') {
        this.createTextElement(e.clientX, e.clientY);
      } else if (this.currentTool === 'shape') {
        this.createShapeElement(e.clientX, e.clientY);
      }
    }
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;

    if (this.currentTool === 'pan') {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.offsetX += dx;
      this.offsetY += dy;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.render();
    }
  }

  handleMouseUp() {
    this.isDragging = false;
  }

  handleWheel(e) {
    e.preventDefault();

    // Calculate point under mouse before zoom
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Convert to canvas coordinates
    const canvasX = (mouseX - this.offsetX) / this.scale;
    const canvasY = (mouseY - this.offsetY) / this.scale;

    // Apply zoom with a slower factor
    const zoomIntensity = 0.0005; // Reduced from the typical 0.001 for slower zoom
    const zoomFactor = 1 + (e.deltaY > 0 ? -zoomIntensity : zoomIntensity) * Math.abs(e.deltaY);
    this.scale *= zoomFactor;

    // Limit zoom level
    this.scale = Math.min(Math.max(0.01, this.scale), 50);

    // Adjust offset to keep point under mouse
    this.offsetX = mouseX - canvasX * this.scale;
    this.offsetY = mouseY - canvasY * this.scale;

    this.render();
  }

  zoom(factor) {
    // Zoom centered on the middle of the screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // Convert to canvas coordinates
    const canvasX = (centerX - this.offsetX) / this.scale;
    const canvasY = (centerY - this.offsetY) / this.scale;

    // Apply zoom
    this.scale *= factor;

    // Limit zoom level
    this.scale = Math.min(Math.max(0.1, this.scale), 10);

    // Adjust offset to keep center point
    this.offsetX = centerX - canvasX * this.scale;
    this.offsetY = centerY - canvasY * this.scale;

    this.render();
  }

  setTool(tool) {
    this.currentTool = tool;

    // Update UI
    document.querySelectorAll('.tool-button').forEach(button => {
      button.classList.remove('active');
    });
    document.getElementById(`${tool}-tool`).classList.add('active');

    // Show/hide properties panel
    const propertiesPanel = document.getElementById('properties-panel');
    if (tool === 'text') {
      propertiesPanel.classList.remove('hidden');
    } else {
      propertiesPanel.classList.add('hidden');
    }

    // Update cursor
    if (tool === 'pan') {
      this.canvas.style.cursor = 'grab';
    } else if (tool === 'text') {
      this.canvas.style.cursor = 'text';
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  }

  createTextElement(x, y) {
    // Convert screen coordinates to canvas coordinates
    const canvasX = (x - this.offsetX) / this.scale;
    const canvasY = (y - this.offsetY) / this.scale;

    const textElement = {
      type: 'text',
      x: canvasX,
      y: canvasY,
      text: '0 ≡ 1 ≡ ∞',
      fontSize: 16,
      fontFamily: 'Verdana',
      color: '#ffffff',
      editable: true
    };

    this.elements.push(textElement);
    this.activeElement = textElement;
    this.render();

    // Create an editable div for text input
    this.createEditableTextDiv(textElement);
  }

  createShapeElement(x, y) {
    // Convert screen coordinates to canvas coordinates
    const canvasX = (x - this.offsetX) / this.scale;
    const canvasY = (y - this.offsetY) / this.scale;

    const shapeElement = {
      type: 'circle',
      x: canvasX,
      y: canvasY,
      radius: 50,
      color: '#ffffff',
      editable: true
    };

    this.elements.push(shapeElement);
    this.activeElement = shapeElement;
    this.render();
  }

  createEditableTextDiv(textElement) {
    // Remove any existing editable divs
    const existingDivs = document.querySelectorAll('.editable-text');
    existingDivs.forEach(div => div.remove());

    // Create a new editable div
    const editableDiv = document.createElement('div');
    editableDiv.className = 'editable-text';
    editableDiv.contentEditable = true;
    editableDiv.textContent = textElement.text;

    // Position the div
    const screenX = textElement.x * this.scale + this.offsetX;
    const screenY = textElement.y * this.scale + this.offsetY;
    editableDiv.style.left = `${screenX}px`;
    editableDiv.style.top = `${screenY}px`;
    editableDiv.style.fontSize = `${textElement.fontSize * this.scale}px`;
    editableDiv.style.fontFamily = textElement.fontFamily;
    editableDiv.style.color = textElement.color;

    document.body.appendChild(editableDiv);
    editableDiv.focus();

    // Update the text element when the div loses focus
    editableDiv.addEventListener('blur', () => {
      textElement.text = editableDiv.textContent;
      editableDiv.remove();
      this.render();
    });

    // Handle key events
    editableDiv.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        editableDiv.blur();
      }
    });
  }

  updateTextProperties() {
    if (!this.activeElement || this.activeElement.type !== 'text') return;

    const fontFamily = document.getElementById('font-family').value;
    const fontSize = parseInt(document.getElementById('font-size').value);
    const fontColor = document.getElementById('font-color').value;

    this.activeElement.fontFamily = fontFamily;
    this.activeElement.fontSize = fontSize;
    this.activeElement.color = fontColor;

    // Update the font size display
    document.getElementById('font-size-value').textContent = `${fontSize}px`;

    // Update the editable div if it exists
    const editableDiv = document.querySelector('.editable-text');
    if (editableDiv) {
      editableDiv.style.fontFamily = fontFamily;
      editableDiv.style.fontSize = `${fontSize * this.scale}px`;
      editableDiv.style.color = fontColor;
    }

    this.render();
  }

  loadInitialContent() {
    // Add title
    this.elements.push({
      type: 'text',
      x: 0,
      y: -300,
      text: '0nefinity.love',
      fontSize: 48,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    // Add main formula
    this.elements.push({
      type: 'text',
      x: 0,
      y: -230,
      text: '0 ≡ 1 ≡ ∞',
      fontSize: 36,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    // Add a circle
    this.elements.push({
      type: 'circle',
      x: 0,
      y: -350,
      radius: 100,
      color: '#ffffff'
    });

    // Add content from index.html
    this.addIndexContent();
  }

  addIndexContent() {
    // Main intro text
    this.elements.push({
      type: 'text',
      x: 0,
      y: -150,
      text: '0 1 ∞ are basically the same',
      fontSize: 20,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    this.elements.push({
      type: 'text',
      x: 0,
      y: -120,
      text: '0 1 ∞ are, embody, point to and conceptualize the most basic fundamental aspects of math and everything\nand this whole singularity called reality, called universe, called 0nefinity, called god (or your version of it)',
      fontSize: 16,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    this.elements.push({
      type: 'text',
      x: 0,
      y: -70,
      text: 'most of maths basic stuff can\'t be described without aspects of 0 1 ∞\ntake the simple definition of a line.\nA Line is an infinitely long object with no width, depth, or curvature\nso 1 line is ∞ long with 0 width, depth, or curvature',
      fontSize: 16,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    this.elements.push({
      type: 'text',
      x: 0,
      y: 0,
      text: 'Welcome to nondual mathematics',
      fontSize: 24,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    this.elements.push({
      type: 'text',
      x: 0,
      y: 40,
      text: '0nefinity describes the metamathematics of mathematics and everything what derives from that\n\ne.g. nature, physics, religion, spirituality, culture, integrality, reality, you, me, the thing which is us both\nthe mathematical I\'AMness',
      fontSize: 16,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    this.elements.push({
      type: 'text',
      x: 0,
      y: 120,
      text: 'A giant megalomaniacal insolence of Kosmos reducing itself to the simplest possible mathematical formular which above all, describes itself completely',
      fontSize: 16,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    this.elements.push({
      type: 'text',
      x: 0,
      y: 160,
      text: '0 ≡ 1 ≡ ∞',
      fontSize: 36,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });

    this.elements.push({
      type: 'text',
      x: 0,
      y: 220,
      text: 'So simple a child could understand\nYet so profound that it can never be fully understood\nIt can be embraced. You can become it cause you are it.\n\nContemplate this, meditate on this, realize its profoundity\n\nRealize absolute 0nefinity',
      fontSize: 16,
      fontFamily: 'Verdana',
      color: '#ffffff'
    });
  }

  drawGrid() {
    if (!this.showGrid) return;

    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Calculate grid size based on zoom level
    const adjustedGridSize = this.gridSize * this.scale;

    // Only draw grid if it's not too dense or too sparse
    if (adjustedGridSize < 10 || adjustedGridSize > 200) return;

    // Calculate grid offset
    const offsetX = this.offsetX % adjustedGridSize;
    const offsetY = this.offsetY % adjustedGridSize;

    // Draw vertical grid lines
    ctx.beginPath();
    for (let x = offsetX; x < width; x += adjustedGridSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }

    // Draw horizontal grid lines
    for (let y = offsetY; y < height; y += adjustedGridSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.stroke();

    // Draw axes
    const originX = this.offsetX;
    const originY = this.offsetY;

    ctx.beginPath();
    // X-axis
    ctx.moveTo(0, originY);
    ctx.lineTo(width, originY);
    // Y-axis
    ctx.moveTo(originX, 0);
    ctx.lineTo(originX, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  render() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw grid
    this.drawGrid();

    // Apply transformation
    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // Draw all elements
    this.elements.forEach(element => {
      if (element.type === 'text') {
        this.drawText(element);
      } else if (element.type === 'circle') {
        this.drawCircle(element);
      }
    });

    this.ctx.restore();

    // Update minimap
    this.updateMinimap();
  }

  drawText(element) {
    this.ctx.font = `${element.fontSize}px ${element.fontFamily}`;
    this.ctx.fillStyle = element.color;
    this.ctx.textBaseline = 'top';

    // Handle multi-line text
    const lines = element.text.split('\n');
    lines.forEach((line, index) => {
      this.ctx.fillText(line, element.x, element.y + (index * element.fontSize * 1.2));
    });
  }

  drawCircle(element) {
    this.ctx.beginPath();
    this.ctx.arc(element.x, element.y, element.radius, 0, Math.PI * 2);
    this.ctx.fillStyle = element.color;
    this.ctx.fill();
  }

  updateMinimap() {
    const ctx = this.minimapCtx;
    const width = this.minimap.width;
    const height = this.minimap.height;

    // Clear minimap
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Calculate minimap scale
    const contentBounds = this.getContentBounds();
    const contentWidth = contentBounds.maxX - contentBounds.minX;
    const contentHeight = contentBounds.maxY - contentBounds.minY;

    // Avoid division by zero
    if (contentWidth === 0 || contentHeight === 0) return;

    const scaleX = width / (contentWidth * 1.2);
    const scaleY = height / (contentHeight * 1.2);
    const minimapScale = Math.min(scaleX, scaleY);

    // Calculate content center
    const contentCenterX = (contentBounds.minX + contentBounds.maxX) / 2;
    const contentCenterY = (contentBounds.minY + contentBounds.maxY) / 2;

    // Draw elements on minimap
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(minimapScale, minimapScale);
    ctx.translate(-contentCenterX, -contentCenterY);

    this.elements.forEach(element => {
      if (element.type === 'text') {
        ctx.fillStyle = element.color;
        ctx.fillRect(element.x, element.y, element.text.length * element.fontSize / 4, element.fontSize);
      } else if (element.type === 'circle') {
        ctx.beginPath();
        ctx.arc(element.x, element.y, element.radius, 0, Math.PI * 2);
        ctx.fillStyle = element.color;
        ctx.fill();
      }
    });

    // Draw viewport rectangle
    const viewportWidth = this.canvas.width / this.scale;
    const viewportHeight = this.canvas.height / this.scale;
    const viewportX = -this.offsetX / this.scale;
    const viewportY = -this.offsetY / this.scale;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2 / minimapScale;
    ctx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);

    ctx.restore();
  }

  getContentBounds() {
    // Calculate the bounds of all content
    let minX = 0, minY = 0, maxX = 0, maxY = 0;

    if (this.elements.length === 0) {
      minX = -500;
      minY = -500;
      maxX = 500;
      maxY = 500;
    } else {
      this.elements.forEach(element => {
        if (element.type === 'text') {
          const textWidth = element.text.length * element.fontSize / 2;
          const textHeight = element.fontSize * (element.text.split('\n').length);

          minX = Math.min(minX, element.x);
          minY = Math.min(minY, element.y);
          maxX = Math.max(maxX, element.x + textWidth);
          maxY = Math.max(maxY, element.y + textHeight);
        } else if (element.type === 'circle') {
          minX = Math.min(minX, element.x - element.radius);
          minY = Math.min(minY, element.y - element.radius);
          maxX = Math.max(maxX, element.x + element.radius);
          maxY = Math.max(maxY, element.y + element.radius);
        }
      });

      // Add some padding
      const padding = 100;
      minX -= padding;
      minY -= padding;
      maxX += padding;
      maxY += padding;
    }

    return { minX, minY, maxX, maxY };
  }
}

// Initialize the canvas when the page loads
document.addEventListener('DOMContentLoaded', () => {
  const infiniteCanvas = new InfiniteCanvas();
});
