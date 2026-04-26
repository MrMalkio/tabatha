class FlipClock extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.time = new Date();
    this.config = {
      is24Hour: false,
      showSeconds: false,
      scale: 1.0,
      brightness: 1.0,
      textColor: '#e0e0e0',
      flipSpeed: 0.6,
      ...this.getCustomConfig()
    };
  }

  getCustomConfig() {
    return {
      scale: parseFloat(this.getAttribute('scale')) || 1.0,
      showSeconds: this.hasAttribute('show-seconds'),
      is24Hour: this.hasAttribute('24-hour'),
      textColor: this.getAttribute('color') || '#e0e0e0'
    };
  }

  connectedCallback() {
    this.render();
    this.timer = setInterval(() => {
      this.time = new Date();
      this.updateClock();
    }, 1000);
  }

  disconnectedCallback() {
    clearInterval(this.timer);
  }

  pad(n) {
    return String(n).padStart(2, '0');
  }

  updateClock() {
    let hours = this.time.getHours();
    const isPM = hours >= 12;
    if (!this.config.is24Hour) {
      hours = hours % 12 || 12;
    }
    const hStr = this.pad(hours);
    const mStr = this.pad(this.time.getMinutes());
    const sStr = this.pad(this.time.getSeconds());

    this.updateDigit('h1', hStr[0]);
    this.updateDigit('h2', hStr[1]);
    this.updateDigit('m1', mStr[0]);
    this.updateDigit('m2', mStr[1]);

    if (this.config.showSeconds) {
      this.updateDigit('s1', sStr[0], true);
      this.updateDigit('s2', sStr[1], true);
    }
    
    if (!this.config.is24Hour) {
        const ampmEl = this.shadowRoot.querySelector('.am-pm');
        if (ampmEl) ampmEl.textContent = isPM ? 'PM' : 'AM';
    }
  }

  updateDigit(id, newDigit, isSecond = false) {
    const digitEl = this.shadowRoot.getElementById(id);
    if (!digitEl) return;
    const currentDigit = digitEl.dataset.digit || '0';
    if (currentDigit !== newDigit) {
      this.flipAnimation(digitEl, currentDigit, newDigit, isSecond);
    }
  }

  flipAnimation(el, oldDigit, newDigit, isSecond) {
    el.dataset.digit = newDigit;
    
    const top = el.querySelector('.digital-top');
    const bottom = el.querySelector('.digital-bottom');
    const flapTop = el.querySelector('.flap-top');
    const flapBottom = el.querySelector('.flap-bottom');

    // Prepare flip
    top.dataset.content = newDigit;
    bottom.dataset.content = oldDigit;
    flapTop.dataset.content = oldDigit;
    flapBottom.dataset.content = newDigit;

    el.classList.add('flipping');
    
    const speed = isSecond ? Math.min(this.config.flipSpeed, 0.9) : this.config.flipSpeed;
    const ms = (speed * 1000) + 50;
    
    setTimeout(() => {
      el.classList.remove('flipping');
      bottom.dataset.content = newDigit;
    }, ms);
  }

  createDigitHTML(id) {
    return `
      <div class="flip-digit" id="${id}">
        <div class="digital-top" data-content="0"></div>
        <div class="digital-bottom" data-content="0"></div>
        <div class="flap-top" data-content="0"></div>
        <div class="flap-bottom" data-content="0"></div>
      </div>
    `;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          --clock-scale: ${this.config.scale};
          --clock-brightness: ${this.config.brightness};
          --clock-text-color: ${this.config.textColor};
          --flip-speed: ${this.config.flipSpeed}s;
        }
        
        .clock-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 20px;
          transform: scale(var(--clock-scale));
          filter: brightness(var(--clock-brightness));
          position: relative;
        }

        .flip-group {
          display: flex;
          gap: 8px;
        }

        .flip-digit {
          position: relative;
          width: 140px;
          height: 200px;
          background-color: #1a1a1a;
          border-radius: 12px;
          font-family: 'Bebas Neue', sans-serif;
          font-size: 160px;
          color: var(--clock-text-color);
          text-align: center;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          perspective: 800px;
        }

        .flip-digit::after {
          content: '';
          position: absolute;
          top: 50%;
          left: -5%;
          width: 110%;
          height: 2px;
          background-color: #0b0b0b;
          z-index: 10;
          transform: translateY(-50%);
          box-shadow: 0 1px 2px rgba(0,0,0,0.8);
        }

        .digital-top, .digital-bottom {
          position: absolute;
          left: 0;
          width: 100%;
          height: 50%;
          overflow: hidden;
          border-radius: 12px;
          color: var(--clock-text-color);
        }

        .digital-top {
          top: 0;
          background: linear-gradient(180deg, #222 0%, #1a1a1a 100%);
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
          z-index: 1;
        }

        .digital-bottom {
          bottom: 0;
          background: linear-gradient(180deg, #181818 0%, #111 100%);
          border-top-left-radius: 0;
          border-top-right-radius: 0;
          z-index: 1;
        }

        .flap-top, .flap-bottom {
          position: absolute;
          left: 0;
          width: 100%;
          height: 50%;
          overflow: hidden;
          color: var(--clock-text-color);
          opacity: 0;
          pointer-events: none;
          z-index: 5;
          transform-style: preserve-3d;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        .flap-top {
          top: 0;
          border-radius: 12px 12px 0 0;
          transform-origin: bottom center;
          background: linear-gradient(180deg, #222 0%, #1a1a1a 100%);
        }

        .flap-bottom {
          bottom: 0;
          border-radius: 0 0 12px 12px;
          transform-origin: top center;
          background: linear-gradient(180deg, #181818 0%, #111 100%);
        }

        .digital-top::after, .digital-bottom::after,
        .flap-top::after, .flap-bottom::after {
          content: attr(data-content);
          position: absolute;
          left: 0;
          width: 100%;
          height: 200px;
          line-height: 200px;
          text-align: center;
          color: var(--clock-text-color);
        }

        .digital-top::after, .flap-top::after { top: 0; }
        .digital-bottom::after, .flap-bottom::after { bottom: 0; }

        .flipping .flap-top {
          opacity: 1;
          animation: fold-top var(--flip-speed) linear forwards;
        }

        .flipping .flap-bottom {
          opacity: 1;
          animation: fold-bottom var(--flip-speed) linear forwards;
        }

        @keyframes fold-top {
          0% { transform: rotateX(0deg); box-shadow: 0 0 0 rgba(0,0,0,0); }
          50% { transform: rotateX(-90deg); box-shadow: 0 8px 15px rgba(0,0,0,0.8); }
          100% { transform: rotateX(-90deg); box-shadow: 0 0 0 rgba(0,0,0,0); }
        }

        @keyframes fold-bottom {
          0% { transform: rotateX(90deg); }
          50% { transform: rotateX(90deg); box-shadow: 0 8px 15px rgba(0,0,0,0.8); }
          100% { transform: rotateX(0deg); box-shadow: 0 0 0 rgba(0,0,0,0); }
        }

        .clock-colon {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 120px;
          color: var(--clock-text-color);
          line-height: 200px;
          opacity: 0.6;
          animation: colon-pulse 1s ease-in-out infinite;
          user-select: none;
        }

        @keyframes colon-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 0.2; }
        }

        .am-pm {
          position: absolute;
          right: -65px;
          bottom: 10px;
          font-size: 24px;
          font-weight: 600;
          color: #666;
          opacity: 0.5;
          letter-spacing: 2px;
        }
      </style>
      <div class="clock-row">
        <div class="flip-group">
          ${this.createDigitHTML('h1')}
          ${this.createDigitHTML('h2')}
        </div>
        <div class="clock-colon">:</div>
        <div class="flip-group">
          ${this.createDigitHTML('m1')}
          ${this.createDigitHTML('m2')}
        </div>
        ${this.config.showSeconds ? `
          <div class="clock-colon">:</div>
          <div class="flip-group">
            ${this.createDigitHTML('s1')}
            ${this.createDigitHTML('s2')}
          </div>
        ` : ''}
        ${!this.config.is24Hour ? '<div class="am-pm"></div>' : ''}
      </div>
    `;
    this.updateClock();
  }
}

customElements.define('flip-clock', FlipClock);
