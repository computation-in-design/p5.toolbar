let bg;

function setup() {
  createCanvas(800, 800);
  bg = color(220);
}

function draw() {
  background(bg);

  if (mouseIsPressed) {
    bg = color(255, 255, 0);
  } else {
    bg = color(220);
  }
}
