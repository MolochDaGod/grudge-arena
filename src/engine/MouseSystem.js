/**
 * Mouse System — custom cursor sprite, 3D hover detection, and tooltips.
 */

import * as THREE from 'three';

export class MouseSystem {
  constructor(camera, scene, renderer) {
    this.camera = camera;
    this.scene = scene;
    this.renderer = renderer;
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hoverTarget = null;
    this.hoverCallbacks = new Map();
    this.cursorSprite = null;
    this.tooltip = null;
    this._setupListeners();
    this._createCursor();
    this._createTooltip();
  }

  _setupListeners() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      if (this.cursorSprite) {
        this.cursorSprite.style.left = e.clientX + 'px';
        this.cursorSprite.style.top = e.clientY + 'px';
      }
    });
  }

  _createCursor() {
    this.cursorSprite = document.createElement('div');
    this.cursorSprite.id = 'customCursor';
    this.cursorSprite.innerHTML = `
      <svg width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#4488ff" stroke-width="2"/>
        <circle cx="16" cy="16" r="4" fill="#4488ff"/>
        <line x1="16" y1="0" x2="16" y2="8" stroke="#4488ff" stroke-width="2"/>
        <line x1="16" y1="24" x2="16" y2="32" stroke="#4488ff" stroke-width="2"/>
        <line x1="0" y1="16" x2="8" y2="16" stroke="#4488ff" stroke-width="2"/>
        <line x1="24" y1="16" x2="32" y2="16" stroke="#4488ff" stroke-width="2"/>
      </svg>`;
    this.cursorSprite.style.cssText = `position:fixed;pointer-events:none;z-index:10000;transform:translate(-50%,-50%);transition:transform 0.1s ease;`;
    document.body.appendChild(this.cursorSprite);
    document.body.style.cursor = 'none';
  }

  _createTooltip() {
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tooltip';
    this.tooltip.style.cssText = `position:fixed;background:rgba(20,20,40,0.95);border:1px solid #4488ff;border-radius:8px;padding:10px 15px;color:white;font-size:14px;pointer-events:none;z-index:9999;display:none;max-width:300px;`;
    document.body.appendChild(this.tooltip);
  }

  registerHoverable(mesh, data) { this.hoverCallbacks.set(mesh, data); }

  showTooltip(x, y, content) { this.tooltip.innerHTML = content; this.tooltip.style.left = (x + 20) + 'px'; this.tooltip.style.top = (y + 20) + 'px'; this.tooltip.style.display = 'block'; }
  hideTooltip() { this.tooltip.style.display = 'none'; }

  setCursorStyle(style) {
    if (!this.cursorSprite) return;
    const colors = { attack: '#ff4444', interact: '#44ff44', default: '#4488ff' };
    const color = colors[style] || colors.default;
    const circles = this.cursorSprite.querySelectorAll('circle');
    if (circles[0]) circles[0].setAttribute('stroke', color);
    if (circles[1]) circles[1].setAttribute('fill', color);
  }

  update() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const hoverables = Array.from(this.hoverCallbacks.keys());
    const intersects = this.raycaster.intersectObjects(hoverables, true);

    if (intersects.length > 0) {
      let target = intersects[0].object;
      while (target && !this.hoverCallbacks.has(target)) target = target.parent;
      if (target && this.hoverCallbacks.has(target)) {
        if (this.hoverTarget !== target) {
          if (this.hoverTarget) this._onHoverEnd(this.hoverTarget);
          this.hoverTarget = target;
          this._onHoverStart(target);
        }
      }
    } else if (this.hoverTarget) {
      this._onHoverEnd(this.hoverTarget);
      this.hoverTarget = null;
    }
  }

  _onHoverStart(target) {
    const data = this.hoverCallbacks.get(target);
    if (!data) return;
    if (data.highlight) {
      target.traverse(child => {
        if (child.isMesh && child.material) {
          child.userData.originalEmissive = child.material.emissive?.clone();
          if (child.material.emissive) { child.material.emissive.set(0x4488ff); child.material.emissiveIntensity = 0.3; }
        }
      });
    }
    if (data.cursorStyle) this.setCursorStyle(data.cursorStyle);
  }

  _onHoverEnd(target) {
    target.traverse(child => {
      if (child.isMesh && child.material && child.userData.originalEmissive) {
        child.material.emissive.copy(child.userData.originalEmissive);
        child.material.emissiveIntensity = 0;
      }
    });
    this.setCursorStyle('default');
    this.hideTooltip();
  }

  getWorldPosition() {
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    this.raycaster.setFromCamera(this.mouse, this.camera);
    this.raycaster.ray.intersectPlane(plane, target);
    return target;
  }

  dispose() {
    if (this.cursorSprite?.parentNode) this.cursorSprite.parentNode.removeChild(this.cursorSprite);
    if (this.tooltip?.parentNode) this.tooltip.parentNode.removeChild(this.tooltip);
    document.body.style.cursor = '';
  }
}
