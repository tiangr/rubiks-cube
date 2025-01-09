let cubeSize = 50; // Size of each cubie
let spacing = 1;   // Small gap between cubies
let rubikCube;     // Rubik's Cube object
let video;
let videoCanvas;
let videoCtx;
let easyCam;
let lastHandPosition = null;
let fistDetected = false;
let landmarks = null; // Initialize the landmarks array
let rotationSensitivity = 0.01; // Adjust sensitivity for rotation
let swipeThreshold = 0.2; // Threshold for detecting swipe
let isLoading = true; // Flag to track loading state


function setupMediaPipe() {
  const videoElement = document.getElementById("videoElement");

  handDetector = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  handDetector.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

  handDetector.onResults((results) => {
    landmarks = results.multiHandLandmarks[0] || [];
  });

  const camera = new Camera(videoElement, {
    onFrame: async () => {
      await handDetector.send({ image: videoElement });
    },
    width: 320,
    height: 240,
  });
  // Start the camera and hide the loading screen once ready
  camera.start().then(() => {
    isLoading = false;
    document.getElementById("loadingScreen").style.display = "none"; // Hide loading screen
  });
}

function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL); // Make the canvas full screen
  easyCam = createEasyCam(); // Easy camera controls

  // Setup camera and canvas for video
  video = createCapture(VIDEO);
  video.size(320, 240);
  video.hide(); // Hide default video to manage custom canvas
  videoCanvas = document.getElementById("videoCanvas");
  videoCtx = videoCanvas.getContext("2d");

  // Initialize loading screen visibility
  document.getElementById("loadingScreen").style.display = "flex";

  setupMediaPipe();

  rubikCube = new RubikCube(cubeSize, spacing); // Initialize the Rubik's Cube
  printCubeState(); // Log the initial state of the Rubik's Cube
}

// Adjust the canvas size when the window is resized
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}


function draw() {
  if (isLoading) {
    return; // Skip rendering while loading
  }
  background(30);
  lights();

  rubikCube.updateAnimation(); // Update ongoing animation
  rubikCube.display(); // Display Rubik's Cube

  // Draw video on the canvas
  videoCtx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);
  videoCtx.drawImage(video.elt, 0, 0, videoCanvas.width, videoCanvas.height);

  // Render hand landmarks if available
  if (landmarks !== null) {
    drawHandLandmarks(landmarks);

    if (fistDetected) {
      console.log("Fist detected!"); // Debug log
      controlCubeWithHand(landmarks);
    } else {
      updateLastHandPosition(landmarks[0]);
    }
  }
}

function startDetection() {
  if (landmarks !== null) {
    detectFist(landmarks);
    detectGesture(landmarks);
    detectSwipe(landmarks);
  }
}

setInterval(startDetection, 100); // Run detection at regular intervals

function detectFist(landmarks) {
  if (!landmarks || landmarks.length < 21) {
    fistDetected = false; // No fist detected if landmarks are invalid
    return;
  }

  // Calculate bounding box dimensions
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  landmarks.forEach((landmark) => {
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
  });

  const boundingBoxWidth = maxX - minX;
  const boundingBoxHeight = maxY - minY;

  // Use the diagonal of the bounding box as a stable scale
  const handScale = Math.hypot(boundingBoxWidth, boundingBoxHeight);

  // Calculate thumb-to-pinky distance
  const thumbTip = landmarks[4];
  const pinkyTip = landmarks[20];
  const thumbPinkyDistance = Math.hypot(
    thumbTip.x - pinkyTip.x,
    thumbTip.y - pinkyTip.y,
    thumbTip.z - pinkyTip.z
  );

  // Calculate palm openness (distance between wrist and middle finger base)
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  const palmOpenness = Math.hypot(
    wrist.x - middleBase.x,
    wrist.y - middleBase.y,
    wrist.z - middleBase.z
  );

  // Normalize distances
  const normalizedThumbPinky = thumbPinkyDistance / handScale;
  const normalizedPalmOpenness = palmOpenness / handScale;

  console.log(`Thumb-Pinky: ${normalizedThumbPinky}, Palm Openness: ${normalizedPalmOpenness}`);

  // Detect fist based on combined thresholds
  const isFist = normalizedThumbPinky < 0.58 && normalizedPalmOpenness > 0.50;

  fistDetected = isFist;
}


function toggleAxis() {
  if (!selectedAxis || selectedAxis === "z") {
    selectedAxis = "x";
  } else if (selectedAxis === "x") {
    selectedAxis = "y";
  } else if (selectedAxis === "y") {
    selectedAxis = "z";
  }
  console.log(`Axis selected: ${selectedAxis}`);
}

let pinchActive = false; // Track if pinch is active
let rockNRollActive = false;
function detectGesture(landmarks) {
  if (!landmarks || landmarks.length < 21) return;

  // Calculate the hand scale (distance between wrist and middle finger base)
  const wrist = landmarks[0];
  const middleBase = landmarks[9];
  const handScale = Math.hypot(
    middleBase.x - wrist.x,
    middleBase.y - wrist.y,
    middleBase.z - wrist.z
  );

  // Avoid division by zero
  if (handScale === 0) return;

  // Normalize distances
  const normalizedDistance = (pointA, pointB) =>
    Math.hypot(
      pointA.x - pointB.x,
      pointA.y - pointB.y,
      pointA.z - pointB.z
    ) / handScale;

  // Check for pinch gesture (thumb and index tip distance)
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const pinchDistance = normalizedDistance(thumbTip, indexTip);

  if (pinchDistance < 0.2) { // Adjust normalized threshold
    if (!pinchActive) {
      console.log("Pinch detected!");
      toggleAxis();
      pinchActive = true;
    }
  } else {
    pinchActive = false;
  }

  // Detect other gestures only if a fist is not detected
  if (fistDetected) {
    console.log("Fist gesture active. Skipping other gestures.");
    return;
  }

  // Helper to determine if a finger is extended
  const isFingerExtended = (tipIndex, middleIndex) => {
    const tip = landmarks[tipIndex];
    const middle = landmarks[middleIndex];
    return (
      Math.hypot(tip.x - wrist.x, tip.y - wrist.y, tip.z - wrist.z) >
      Math.hypot(middle.x - wrist.x, middle.y - wrist.y, middle.z - wrist.z)
    );
  };

  // Detect finger states
  const thumbExtended = isFingerExtended(4, 3);   // Thumb
  const indexExtended = isFingerExtended(8, 7);  // Index finger
  const pinkyExtended = isFingerExtended(20, 19); // Pinky finger
  const middleCurled = !isFingerExtended(12, 11); // Middle finger curled
  const ringCurled = !isFingerExtended(16, 15);   // Ring finger curled

  // Check for "thumb's up" gesture
  if (
    thumbExtended &&
    !indexExtended &&
    middleCurled &&
    ringCurled &&
    !pinkyExtended
  ) {
    console.log("Thumb's Up detected!");
    rubikCube.scramble(40); // Scramble the cube with 40 random moves
  }

  // Check for Rock 'n' Roll gesture
  if (thumbExtended && indexExtended && pinkyExtended && middleCurled && ringCurled) {
    if (!rockNRollActive) {
      rockNRollActive = true;
      console.log("ROCK N ROLL!");
      selectedLayer = (selectedLayer + 1) % rubikCube.size; // Toggle layer
      console.log(`Selected layer: ${selectedLayer}`);
    }
  } else {
    rockNRollActive = false; // Reset state when gesture is released
  }
}



let handPositions = []; // Store recent wrist positions
const maxPositions = 5; // Number of positions to average
let lastSwipeDirection = null; // Track last swipe direction
let lastSwipeTime = 0; // Track last swipe time

function detectSwipe(landmarks) {
  if (!landmarks || landmarks.length < 1 || !landmarks[0]) return;

  const wrist = landmarks[0];
  const currentPosition = { x: wrist.x, y: wrist.y };

  // Add current position to the history and maintain max size
  handPositions.push(currentPosition);
  if (handPositions.length > maxPositions) handPositions.shift();

  // Calculate average position for smoothing
  const avgPosition = handPositions.reduce(
    (avg, pos) => ({
      x: avg.x + pos.x / handPositions.length,
      y: avg.y + pos.y / handPositions.length,
    }),
    { x: 0, y: 0 }
  );

  // If no previous position exists, initialize and return
  if (!lastHandPosition) {
    lastHandPosition = avgPosition;
    return;
  }

  // Calculate movement
  const dx = avgPosition.x - lastHandPosition.x;
  const dy = avgPosition.y - lastHandPosition.y;

  const speed = Math.hypot(dx, dy);
  const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");

  // Check if movement exceeds threshold
  if (speed > swipeThreshold) {
    // Avoid detecting repeated swipes too quickly
    const now = millis();
    if (direction !== lastSwipeDirection || now - lastSwipeTime > 500) {
      lastSwipeDirection = direction;
      lastSwipeTime = now;

      console.log(`Swipe detected: ${direction}`);

      // Trigger action based on swipe direction
      if (direction === "right" || direction === "up") {
        rotateSelectedLayer(selectedAxis, selectedLayer, true); // Clockwise
      } else if (direction === "left" || direction === "down") {
        rotateSelectedLayer(selectedAxis, selectedLayer, false); // Counterclockwise
      }
    }
  }

  // Update the last hand position
  lastHandPosition = avgPosition;
}




function updateLastHandPosition(wristPosition) {
  lastHandPosition = { x: wristPosition.x, y: wristPosition.y };
}

function drawHandLandmarks(landmarks) {
  landmarks = landmarks.map((landmark) => ({
    x: landmark.x * videoCanvas.width,
    y: landmark.y * videoCanvas.height,
  }));

  videoCtx.fillStyle = "red";
  videoCtx.strokeStyle = "white";
  videoCtx.lineWidth = 2;

  landmarks.forEach((landmark) => {
    videoCtx.beginPath();
    videoCtx.arc(landmark.x, landmark.y, 5, 0, 2 * Math.PI);
    videoCtx.fill();
    videoCtx.stroke();
  });
}



class RubikCube {
  constructor(cubeSize, spacing) {
    this.size = 3; // Standard 3x3x3 Rubik's Cube
    this.cubeSize = cubeSize;
    this.spacing = spacing;
    this.cubies = [];
    this.animation = null; // Tracks ongoing animation
    this.animationProgress = 0; // Progress of the animation (0 to 1)

    // Initialize 3D array for Rubik's Cube
    this.grid = Array.from({ length: this.size }, (_, x) =>
      Array.from({ length: this.size }, (_, y) =>
        Array.from({ length: this.size }, (_, z) => {
          const posX = (x - 1) * (cubeSize + spacing);
          const posY = (y - 1) * (cubeSize + spacing);
          const posZ = (z - 1) * (cubeSize + spacing);
          const cubie = new Cubie(posX, posY, posZ, cubeSize);
          this.cubies.push(cubie);
          return cubie;
        })
      )
    );
  }

  scramble(moves = 40) {
    const axes = ["x", "y", "z"];
    let moveIndex = 0;

    const performMove = () => {
      if (moveIndex >= moves) {
        console.log("Scrambling complete!");
        return;
      }

      const randomAxis = axes[Math.floor(Math.random() * axes.length)];
      const randomLayer = Math.floor(Math.random() * this.size);
      const randomClockwise = Math.random() > 0.5;

      // Rotate the randomly chosen layer along the random axis
      this.rotateFace(randomLayer, randomAxis, randomClockwise);

      // Proceed to the next move after a delay
      moveIndex++;
      console.log(`Move ${moveIndex}/${moves}`);
      setTimeout(performMove, 100); // Adjust delay as needed (500ms here)
    };

    performMove(); // Start the scrambling process
  }
  

  display() {
    const { layer, axis } = this.animation || {}; // Get the layer and axis being animated, if any
  
    // Determine the selected slice (for highlighting)
    let selectedSlice = null;
    if (selectedAxis && selectedLayer !== null) {
      selectedSlice = this.getSlice(selectedLayer, selectedAxis);
    }
  
    // Render cubies
    this.cubies.forEach((cubie) => {
      const isAnimatingCubie =
        this.animation &&
        ((axis === "x" && Math.abs(cubie.position.x - (layer - 1) * (this.cubeSize + this.spacing)) < 0.01) ||
          (axis === "y" && Math.abs(cubie.position.y - (layer - 1) * (this.cubeSize + this.spacing)) < 0.01) ||
          (axis === "z" && Math.abs(cubie.position.z - (layer - 1) * (this.cubeSize + this.spacing)) < 0.01));
  
      const isSelectedCubie =
        selectedSlice &&
        selectedSlice.some((row) =>
          row.some((selectedCubie) => selectedCubie === cubie)
        );
  
      if (!isAnimatingCubie) {
        cubie.display(isSelectedCubie); // Highlight selected cubies
      }
    });
  
    // Render rotating cubies
    if (this.animation) {
      this.interpolateSlice();
    }
  }
  

  interpolateSlice() {
    const { layer, axis, clockwise } = this.animation;
    const slice = this.getSlice(layer, axis);

    // Calculate the angle of rotation based on animation progress
    const maxAngle = clockwise ? -PI / 2 : PI / 2;
    const currentAngle = this.animationProgress * maxAngle;

    push();
    if (axis === "x") {
      translate((layer - 1) * (this.cubeSize + this.spacing), 0, 0);
      rotateX(currentAngle);
      translate(-(layer - 1) * (this.cubeSize + this.spacing), 0, 0);
    } else if (axis === "y") {
      translate(0, (layer - 1) * (this.cubeSize + this.spacing), 0);
      rotateY(-currentAngle);
      translate(0, -(layer - 1) * (this.cubeSize + this.spacing), 0);
    } else if (axis === "z") {
      translate(0, 0, (layer - 1) * (this.cubeSize + this.spacing));
      rotateZ(currentAngle);
      translate(0, 0, -(layer - 1) * (this.cubeSize + this.spacing));
    }

    // Render the cubies in the rotating slice
    slice.forEach((row) => {
      row.forEach((cubie) => {
        cubie.display(true); // Render rotating cubies
      });
    });

    pop();
  }

  
  getSlice(layer, axis) {
    if (axis === "x") {
      // Extract a column (x-axis layer)
      return this.grid[layer].map((row) => [...row]);
    } else if (axis === "y") {
      // Extract a row (y-axis layer)
      return this.grid.map((col) => col[layer]);
    } else if (axis === "z") {
      // Extract a face (z-axis layer)
      return this.grid.map((col) => col.map((row) => row[layer]));
    } else {
      console.error(`Invalid axis: ${axis}`);
      return [];
    }
  }
  rotateSlice(slice, axis, clockwise) {
    if (!slice || slice.length === 0) {
      console.error("Invalid slice provided to rotateSlice:", slice);
      return slice;
    }
  
    const size = slice.length;
    const rotated = Array.from({ length: size }, () => Array(size).fill(null));
  
    let colorMap;
    if (axis === "x") {
      colorMap = clockwise ? [2, 3, 1, 0, 4, 5] : [3, 2, 0, 1, 4, 5];
    } else if (axis === "y") {
      colorMap = clockwise ? [5, 4, 2, 3, 0, 1] : [4, 5, 2, 3, 1, 0];
    } else if (axis === "z") {
      colorMap = clockwise ? [0, 1, 4, 5, 3, 2] : [0, 1, 5, 4, 2, 3];
    } else {
      console.error(`Invalid axis: ${axis}`);
      return slice;
    }
  
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        // Correct rotation logic for clockwise and counterclockwise
        if (clockwise) {
          rotated[j][size - 1 - i] = slice[i][j]; // Clockwise transformation
        } else {
          rotated[size - 1 - j][i] = slice[i][j]; // Counterclockwise transformation
        }
  
        // Update cubie colors based on rotation
        const cubie = rotated[clockwise ? j : size - 1 - j][clockwise ? size - 1 - i : i];
        if (cubie) cubie.swapColors(colorMap);
      }
    }
  
    return rotated;
  }
  
  
  
  
  
  
  
  updateSlice(rotatedSlice, layer, axis) {
    if (axis === "x") {
        this.grid[layer] = rotatedSlice;
    } else if (axis === "y") {
        this.grid.forEach((col, i) => {
            col[layer] = rotatedSlice[i];
        });
    } else if (axis === "z") {
        this.grid.forEach((col, i) => {
            col.forEach((row, j) => {
                row[layer] = rotatedSlice[i][j];
            });
        });
    }

    // Update positions and reset rotation to 0 for visual rendering
    this.grid.forEach((col, x) => {
        col.forEach((row, y) => {
            row.forEach((cubie, z) => {
                const posX = (x - 1) * (this.cubeSize + this.spacing);
                const posY = (y - 1) * (this.cubeSize + this.spacing);
                const posZ = (z - 1) * (this.cubeSize + this.spacing);
                cubie.setPosition(posX, posY, posZ);
                cubie.setRotation('x', 0); // Reset rotation
                cubie.setRotation('y', 0); // Reset rotation
                cubie.setRotation('z', 0); // Reset rotation
            });
        });
    });
}

  
rotateFace(layer, axis, clockwise = true) {
  if (this.animation) return; // Prevent rotation during animation

  // Get the correct slice for rotation
  const slice = this.getSlice(layer, axis);

  // Rotate the slice and update the grid
  const rotatedSlice = this.rotateSlice(slice, axis, clockwise);
  this.updateSlice(rotatedSlice, layer, axis);

  // Debug: Log cube state after rotation
  this.startAnimation(layer, axis, clockwise);
  printCubeState();
}



  startAnimation(layer, axis, clockwise) {
    this.animation = { layer, axis, clockwise };
    this.animationProgress = 0;
  }

  updateAnimation() {
    if (!this.animation) return;
  
    this.animationProgress += 0.1; // Speed of animation
  
    if (this.animationProgress >= 1) {
      // End animation and update state
      this.animationProgress = 1;
      const { layer, axis, clockwise } = this.animation;
  
      // Rotate the slice and update the grid
      const slice = this.getSlice(layer, axis);
      const rotatedSlice = this.rotateSlice(slice, clockwise);
      this.updateSlice(rotatedSlice, layer, axis);
  
      this.animation = null; // End animation
    } else {
      // Interpolate rotation for smooth animation
      this.interpolateSlice();
    }
  }
  
  
  
  
  
  
  
}


class Cubie {
  constructor(x, y, z, size) {
    this.position = createVector(x, y, z);
    this.size = size;
    this.rotation = { x: 0, y: 0, z: 0 }; // Current rotation angles
    this.colors = [
      color(255, 0, 0),    // Front (red)
      color(255, 165, 0),    // Back (orange)
      color(0, 0, 255),    // Top (blue)
      color(0, 255, 0),  // Bottom (green)
      color(255, 255, 0),  // Left (yellow)
      color(255),          // Right (white)
    ];
  }

  setPosition(x, y, z) {
    this.position.set(x, y, z);
  }

  setRotation(axis, angle) {
    this.rotation[axis] = angle;
  }
  swapColors(faceMap) {
    if (!faceMap || faceMap.length !== 6) {
      console.error("Invalid face map provided to swapColors:", faceMap);
      return;
    }
  
    // Create a copy of the current colors to prevent overwriting
    const newColors = Array(6).fill(null);
    
    for (let i = 0; i < 6; i++) {
      newColors[i] = this.colors[faceMap[i]];
    }
  
    this.colors = newColors;
  }
  
  
  
  
  

  display(isSelected = false) {
    push();
    translate(this.position.x, this.position.y, this.position.z);
    rotateX(this.rotation.x);
    rotateY(this.rotation.y);
    rotateZ(this.rotation.z);
  
    strokeWeight(isSelected ? 4 : 2); // Thicker border for highlighted cubies
    stroke(isSelected ? color(255, 255, 0) : 0); // Yellow border for highlighted cubies
  
    for (let i = 0; i < 6; i++) {
      fill(this.colors[i]);
      beginShape();
      switch (i) {
        case 0: // Front
          vertex(-this.size / 2, -this.size / 2, this.size / 2);
          vertex(this.size / 2, -this.size / 2, this.size / 2);
          vertex(this.size / 2, this.size / 2, this.size / 2);
          vertex(-this.size / 2, this.size / 2, this.size / 2);
          break;
        case 1: // Back
          vertex(-this.size / 2, -this.size / 2, -this.size / 2);
          vertex(this.size / 2, -this.size / 2, -this.size / 2);
          vertex(this.size / 2, this.size / 2, -this.size / 2);
          vertex(-this.size / 2, this.size / 2, -this.size / 2);
          break;
        case 2: // Top
          vertex(-this.size / 2, -this.size / 2, -this.size / 2);
          vertex(this.size / 2, -this.size / 2, -this.size / 2);
          vertex(this.size / 2, -this.size / 2, this.size / 2);
          vertex(-this.size / 2, -this.size / 2, this.size / 2);
          break;
        case 3: // Bottom
          vertex(-this.size / 2, this.size / 2, -this.size / 2);
          vertex(this.size / 2, this.size / 2, -this.size / 2);
          vertex(this.size / 2, this.size / 2, this.size / 2);
          vertex(-this.size / 2, this.size / 2, this.size / 2);
          break;
        case 4: // Left
          vertex(this.size / 2, -this.size / 2, -this.size / 2);
          vertex(this.size / 2, this.size / 2, -this.size / 2);
          vertex(this.size / 2, this.size / 2, this.size / 2);
          vertex(this.size / 2, -this.size / 2, this.size / 2);
          break;
        case 5: // Right
          vertex(-this.size / 2, -this.size / 2, -this.size / 2);
          vertex(-this.size / 2, this.size / 2, -this.size / 2);
          vertex(-this.size / 2, this.size / 2, this.size / 2);
          vertex(-this.size / 2, -this.size / 2, this.size / 2);
          break;
      }
      endShape(CLOSE);
    }
    pop();
  }
  
}



function updateLastHandPosition(wristPosition) {
  lastHandPosition = wristPosition;
}

function controlCubeWithHand(landmarks) {
  if (!landmarks || landmarks.length < 1) return;

  const wrist = landmarks[0];
  const wristX = wrist.x * videoCanvas.width;
  const wristY = wrist.y * videoCanvas.height;

  if (lastHandPosition) {
    const dx = wristX - lastHandPosition[0];
    const dy = wristY - lastHandPosition[1];

    // Scale hand movement for easyCam rotation
    const rotationScale = 0.05; // Adjust sensitivity
    easyCam.rotateY(-dx * rotationScale);
    easyCam.rotateX(-dy * rotationScale);
  }

  lastHandPosition = [wristX, wristY];
}




let selectedAxis = null; // Variable to store the selected axis
let selectedLayer = 0; // Variable to store the selected row/column

function keyPressed() {
  console.log(`Key pressed: ${key}`);
  
  switch (key.toUpperCase()) {
    case 'X': // Select the X-axis
      selectedAxis = 'x';
      console.log("Axis selected: X");
      break;
    case 'Y': // Select the Y-axis
      selectedAxis = 'y';
      console.log("Axis selected: Y");
      break;
    case 'Z': // Select the Z-axis
      selectedAxis = 'z';
      console.log("Axis selected: Z");
      break;
    case 'R': // Rotate along the selected axis (clockwise)
      if (!selectedAxis) {
        console.log("No axis selected! Press X, Y, or Z to select an axis.");
        return;
      }
      console.log(`Rotating layer ${selectedLayer} along axis: ${selectedAxis} (clockwise)`);
      rotateSelectedLayer(selectedAxis, selectedLayer, true); // Clockwise
      break;
    case 'L': // Rotate along the selected axis (counterclockwise)
      if (!selectedAxis) {
        console.log("No axis selected! Press X, Y, or Z to select an axis.");
        return;
      }
      console.log(`Rotating layer ${selectedLayer} along axis: ${selectedAxis} (counterclockwise)`);
      rotateSelectedLayer(selectedAxis, selectedLayer, false); // Counterclockwise
      break;
    case 'ARROWLEFT': // Select the previous row/column
      selectedLayer = (selectedLayer - 1 + rubikCube.size) % rubikCube.size;
      console.log(`Selected layer: ${selectedLayer}`);
      break;
    case 'ARROWRIGHT': // Select the next row/column
      selectedLayer = (selectedLayer + 1) % rubikCube.size;
      console.log(`Selected layer: ${selectedLayer}`);
      break;

    case 'S': // Scramble the cube
      rubikCube.scramble(40); // Perform 20 random moves
      break;
    default:
      console.log(`No action mapped for key: ${key}`);
  }
}


// Helper function to rotate the selected layer along the selected axis
function rotateSelectedLayer(axis, layer, clockwise) {
  rubikCube.rotateFace(layer, axis, clockwise);
}

function printCubeState() {
  const faces = ["front", "back", "top", "bottom", "right", "left"];
  const faceColors = { front: [], back: [], top: [], bottom: [], right: [], left: [] };

  rubikCube.grid.forEach((col, x) => {
    col.forEach((row, y) => {
      row.forEach((cubie, z) => {
        const cubieColors = cubie.colors;

        // Assign colors to the respective faces
        if (z === 2) faceColors.front.push(cubieColors[0]); // Front
        if (z === 0) faceColors.back.push(cubieColors[1]);  // Back
        if (y === 0) faceColors.top.push(cubieColors[2]);   // Top
        if (y === 2) faceColors.bottom.push(cubieColors[3]);// Bottom
        if (x === 2) faceColors.left.push(cubieColors[5]); // left
        if (x === 0) faceColors.right.push(cubieColors[4]);  // right
        
      });
    });
  });

  const mapColorToName = (clr) => {
    if (clr.levels[0] === 255 && clr.levels[1] === 0 && clr.levels[2] === 0) return "RED";
    if (clr.levels[0] === 0 && clr.levels[1] === 255 && clr.levels[2] === 0) return "GREEN";
    if (clr.levels[0] === 0 && clr.levels[1] === 0 && clr.levels[2] === 255) return "BLUE";
    if (clr.levels[0] === 255 && clr.levels[1] === 255 && clr.levels[2] === 0) return "YELLOW";
    if (clr.levels[0] === 255 && clr.levels[1] === 165 && clr.levels[2] === 0) return "ORANGE";
    if (clr.levels[0] === 255 && clr.levels[1] === 255 && clr.levels[2] === 255) return "WHITE";
    return "UNKNOWN";
  };

  // Print the colors for each face in a readable format
  faces.forEach((face) => {
    console.log(`${face} face:`);
    const rows = [];
    for (let i = 0; i < 3; i++) {
      rows.push(
        faceColors[face]
          .slice(i * 3, i * 3 + 3)
          .map((c) => mapColorToName(c))
      );
    }
    rows.forEach((row) => console.log(row));
  });
}
