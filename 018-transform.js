// 018-transform.js
// In the spirit of 0nefinity: 0 1 ∞ are one, transforming into each other
// When you hover over one symbol, it becomes another, showing their unity

(function() {
  'use strict';

  // The trinity of symbols and their transformations
  const SYMBOLS = {
    '0': ['1', '∞'],
    '1': ['0', '∞'],
    '∞': ['0', '1'],
    '8': ['0', '1']  // 8 is ∞ rotated
  };

  // Inject minimal styles for smooth transitions
  function injectStyles() {
    const css = `
.symbol-018 {
  display: inline-block;
  transition: transform 0.3s ease, opacity 0.2s ease;
  cursor: pointer;
  position: relative;
}

.symbol-018:hover {
  transform: scale(1.1);
}

.symbol-018.transforming {
  animation: pulse-018 0.4s ease;
}

@keyframes pulse-018 {
  0%, 100% { 
    transform: scale(1); 
    opacity: 1;
  }
  50% { 
    transform: scale(1.2); 
    opacity: 0.7;
  }
}

/* Preserve spacing in groups */
.group-018 {
  white-space: nowrap;
}
    `;
    
    const styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  }

  // Transform a symbol to its next form
  function getNextSymbol(currentSymbol) {
    const possibleTransforms = SYMBOLS[currentSymbol];
    if (!possibleTransforms) return currentSymbol;
    
    // Randomly choose one of the possible transformations
    return possibleTransforms[Math.floor(Math.random() * possibleTransforms.length)];
  }

  // Wrap individual symbols in spans for interactivity
  function wrapSymbol(symbol) {
    const span = document.createElement('span');
    span.className = 'symbol-018';
    span.textContent = symbol;
    span.dataset.original = symbol;
    return span;
  }

  // Process a text node containing 0 1 ∞ patterns
  function processTextNode(textNode) {
    const text = textNode.textContent;
    
    // Pattern to match various forms of 0 1 ∞
    // Matches: "0 1 ∞", "01∞", "018", "0 1 8", "0 ≡ 1 ≡ ∞", etc.
    const pattern = /(?:^|\s)(0\s*(?:≡\s*)?1\s*(?:≡\s*)?[∞8])(?:\s|$|<)/g;
    
    // Check if this text contains our pattern
    if (!pattern.test(text)) {
      return; // No pattern found, leave as is
    }
    
    // Reset pattern
    pattern.lastIndex = 0;
    
    // Create a container for the transformed content
    const container = document.createElement('span');
    container.className = 'group-018';
    
    let lastIndex = 0;
    let match;
    let hasMatches = false;
    
    while ((match = pattern.exec(text)) !== null) {
      hasMatches = true;
      const fullMatch = match[1];
      const matchStart = match.index + (match[0].length - fullMatch.length - (match[0].endsWith('<') ? 1 : 0));
      
      // Add text before the match
      if (matchStart > lastIndex) {
        container.appendChild(document.createTextNode(text.substring(lastIndex, matchStart)));
      }
      
      // Process each character in the match
      for (let i = 0; i < fullMatch.length; i++) {
        const char = fullMatch[i];
        
        if (char === '0' || char === '1' || char === '∞' || char === '8') {
          container.appendChild(wrapSymbol(char));
        } else {
          // Preserve spacing and other characters (like ≡)
          container.appendChild(document.createTextNode(char));
        }
      }
      
      lastIndex = matchStart + fullMatch.length;
    }
    
    // Add remaining text
    if (lastIndex < text.length) {
      container.appendChild(document.createTextNode(text.substring(lastIndex)));
    }
    
    // Replace the original text node with our container
    if (hasMatches && textNode.parentNode) {
      textNode.parentNode.replaceChild(container, textNode);
    }
  }

  // Walk through all text nodes in the document
  function processAllTextNodes(root = document.body) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script, style, and already processed nodes
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;
          
          const tagName = parent.tagName;
          if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Skip if already processed
          if (parent.classList && parent.classList.contains('symbol-018')) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    // Process all collected text nodes
    textNodes.forEach(processTextNode);
  }

  // Add event listeners for transformation
  function addTransformListeners() {
    document.addEventListener('mouseenter', function(e) {
      if (e.target.classList.contains('symbol-018')) {
        transformSymbol(e.target);
      }
    }, true);

    // Touch support for mobile
    document.addEventListener('touchstart', function(e) {
      if (e.target.classList.contains('symbol-018')) {
        e.preventDefault();
        transformSymbol(e.target);
      }
    }, { passive: false });
  }

  // Transform a symbol element
  function transformSymbol(element) {
    const currentSymbol = element.textContent;
    const nextSymbol = getNextSymbol(currentSymbol);
    
    if (nextSymbol !== currentSymbol) {
      // Add animation class
      element.classList.add('transforming');
      
      // Change the symbol
      element.textContent = nextSymbol;
      
      // Remove animation class after animation completes
      setTimeout(() => {
        element.classList.remove('transforming');
      }, 400);
    }
  }

  // Reset symbol to original on mouse leave (optional - can be removed for persistent transformation)
  function addResetOnLeave() {
    document.addEventListener('mouseleave', function(e) {
      if (e.target.classList.contains('symbol-018')) {
        const original = e.target.dataset.original;
        if (original && e.target.textContent !== original) {
          setTimeout(() => {
            e.target.textContent = original;
          }, 300);
        }
      }
    }, true);
  }

  // Initialize everything when DOM is ready
  function init() {
    injectStyles();
    processAllTextNodes();
    addTransformListeners();
    // Uncomment the next line if you want symbols to reset to original on mouse leave
    // addResetOnLeave();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

