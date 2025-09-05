import { mat4 } from 'gl-matrix';

export class Q3_DepNode {
  constructor(q3_object) {
    this.parent_node = null;
    this.child_nodes = [];
    this.q3_object = q3_object;
    this.tag_name = "";
    // Integer frame for tag sampling (use frameA)
    this.frame_IDX_cur = -1;
    // GPU morphing state for this node's mesh
    this.frameA = 0;
    this.frameB = 0;
    this.lerp = 0.0;

    this.localMatrix = mat4.create();
    this.worldMatrix = mat4.create();
    this.baseTransform = mat4.create(); // For MD3->world orientation correction (top-level)
    this.characterTransform = mat4.create(); // NEW: For character controller rotation
    this.baseOffsetY = 0;               // Dynamic ground offset for top-level
  }

  setParentNode(new_parent_node, tag_name) {
    if (this.parent_node) {
      const idx = this.parent_node.child_nodes.indexOf(this);
      if (idx !== -1) this.parent_node.child_nodes.splice(idx, 1);
    }
    this.parent_node = new_parent_node;
    this.tag_name = tag_name || "";
    if (this.parent_node) this.parent_node.child_nodes.push(this);
  }

  setAsTopLevelNode() {
    if (this.parent_node) {
      this.parent_node.child_nodes = this.parent_node.child_nodes.filter(n => n !== this);
      this.parent_node = null;
      this.tag_name = "";
    }
    // Re-orient MD3 (Z-up, Y-forward) to our world (Y-up, Z-forward)
    mat4.fromXRotation(this.baseTransform, -Math.PI / 2);
    mat4.identity(this.characterTransform); // Initialize character transform
    return this;
  }

  setBaseOffsetY(y) {
    this.baseOffsetY = y;
  }

  // NEW: Set character controller transform (only for root node)
  setCharacterTransform(transform) {
    if (transform) {
      mat4.copy(this.characterTransform, transform);
    } else {
      mat4.identity(this.characterTransform);
    }
  }

  getTopLevelNode() {
    let node = this;
    while (node.parent_node) node = node.parent_node;
    return node;
  }

  // Build this.worldMatrix. For attached nodes, use parent's blended tag matrix (smooth).
  updateTransformation(parentWorldMatrix) {
    if (this.parent_node && this.tag_name) {
      const parent = this.parent_node;
      const mTag = parent.q3_object.getLerpedTagMatrix(this.tag_name, parent.frameA, parent.frameB, parent.lerp);
      if (mTag) {
        // For children, only use the tag transform (top-level applies the MD3->world base transform)
        mat4.copy(this.localMatrix, mTag);
      } else {
        mat4.identity(this.localMatrix);
      }
    } else {
      // Top-level: apply world-space ground offset FIRST, then MD3->world base orientation, then character rotation
      const t = mat4.create();
      mat4.fromTranslation(t, [0, this.baseOffsetY, 0]);           // world Y offset
      
      const temp = mat4.create();
      mat4.multiply(temp, t, this.baseTransform);                  // temp = T_world * R_base
      mat4.multiply(this.localMatrix, temp, this.characterTransform); // local = (T_world * R_base) * R_character
    }

    // World = Parent * Local
    if (parentWorldMatrix) {
      mat4.multiply(this.worldMatrix, parentWorldMatrix, this.localMatrix);
    } else {
      mat4.copy(this.worldMatrix, this.localMatrix);
    }

    // Recursively update children
    for (const child of this.child_nodes) {
      child.updateTransformation(this.worldMatrix);
    }
  }

  drawChilds(program) {
    this.draw(program, this.worldMatrix);
    for (const child of this.child_nodes) child.drawChilds(program);
  }

  draw(program, worldMatrix) {
    this.q3_object.drawMorph(program, this.frameA, this.frameB, this.lerp, worldMatrix);
  }

  drawChildsDepth(program) {
    this.drawDepth(program, this.worldMatrix);
    for (const child of this.child_nodes) {
      child.drawChildsDepth(program);
    }
  }

  drawDepth(program, worldMatrix) {
    this.q3_object.drawDepth(program, this.frameA, this.frameB, this.lerp, worldMatrix);
  }
}