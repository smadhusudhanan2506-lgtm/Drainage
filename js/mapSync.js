// ─────────────────────────────────────────────────────────────
//  DrainGuard Mesh — Map Synchronization Controller
// ─────────────────────────────────────────────────────────────

import { bus } from './utils.js';

export class MapSync {
  constructor(undergroundMap, aboveGroundMap) {
    this.ugMap = undergroundMap;
    this.agMap = aboveGroundMap;
    this.selectedNode = null;

    bus.on('map:select', (data) => {
      this.selectedNode = data.nodeId;
      // Both maps handle their own highlighting via their own listeners
      // This controller just keeps state coherent
    });
  }

  /** Programmatically select and zoom both maps to a node */
  selectNode(nodeId) {
    this.selectedNode = nodeId;
    bus.emit('map:select', { nodeId, source: 'sync' });
    bus.emit('node:detail', { nodeId, sensor: this.ugMap.sensorData[nodeId] });
  }

  /** Clear selection on both maps */
  clearSelection() {
    this.selectedNode = null;
    this.ugMap.selectedNode = null;
    this.agMap.selectedNode = null;
    bus.emit('node:detail:close');
  }

  /** Reset both maps to default view */
  resetViews() {
    this.ugMap.resetView();
    this.agMap.resetView();
    this.clearSelection();
  }
}
