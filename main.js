import { createRenderer, resizeRenderer, clearRenderer, createImage, renderImage } from './renderer';

let scene = [];
let history = [];
let renderer;
let mouseX = 0;
let mouseY = 0;
let needsRender = true;
let selectedImage = null;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

export const init = () => {
	const canvas = document.querySelector("#c");
	const gl = canvas.getContext("webgl2");
	if (!gl) throw new Error("WebGL2 not supported!");
	renderer = createRenderer(canvas, gl);

	// add event listeners
	canvas.addEventListener('touchmove', onTouchMove, { passive: false });
	canvas.addEventListener('touchstart', onTouchStart, { passive: false });
	canvas.addEventListener('touchend', onTouchEnd, { passive: false });
	canvas.addEventListener('mousemove', onMouseMove);
	canvas.addEventListener('mousedown', onMouseDown);
	canvas.addEventListener('mouseup', onMouseUp);
	document.addEventListener('paste', onPaste);
	document.addEventListener('keydown', onKeyDown);
	// window.addEventListener('resize', onResize);

	let img = new Image();
	toDataURL(
		'https://www.jockostore.com/cdn/shop/t/33/assets/popup-image.jpg?v=142777728587095439201637241641',
		(base64String) => {
			img.onload = function () {
				const image = createImage(renderer, img, canvas.width / 2, canvas.height / 2);
				scene.push(image);
				history.push({ type: 'add', image: image });
				needsRender = true;
			};
			img.src = base64String;
			console.log(base64String);
		}
	);

	onResize();
	render();
};

const toDataURL = (url, callback) => {
	let xhr = new XMLHttpRequest();
	xhr.onload = function () {
		let reader = new FileReader();
		reader.onloadend = function () {
			callback(reader.result);
		};
		reader.readAsDataURL(xhr.response);
	};
	xhr.open('GET', url);
	xhr.responseType = 'blob';
	xhr.send();
};

const getImageAtPosition = (x, y) => {
	for (let i = scene.length - 1; i >= 0; i--) {
		const img = scene[i];
		if (
			x >= img.x - img.width / 2 &&
			x <= img.x + img.width / 2 &&
			y >= img.y - img.height / 2 &&
			y <= img.y + img.height / 2
		) {
			return img;
		}
	}
	return null;
};

const onTouchMove = (event) => {
	event.preventDefault(); // Prevent scrolling
	if (event.touches.length === 1) {
		const touch = event.touches[0];
		const rect = event.target.getBoundingClientRect();
		mouseX = touch.clientX - rect.left;
		mouseY = touch.clientY - rect.top;

		if (isDragging && selectedImage) {
			const dx = mouseX - lastMouseX;
			const dy = mouseY - lastMouseY;
			selectedImage.x += dx;
			selectedImage.y += dy;
			needsRender = true;
		}

		lastMouseX = mouseX;
		lastMouseY = mouseY;
	}
};

const onTouchStart = (event) => {
	event.preventDefault();
	if (event.touches.length === 1) {
		const touch = event.touches[0];
		const rect = event.target.getBoundingClientRect();
		mouseX = touch.clientX - rect.left;
		mouseY = touch.clientY - rect.top;
		isDragging = true;
		lastMouseX = mouseX;
		lastMouseY = mouseY;
		selectedImage = getImageAtPosition(mouseX, mouseY);
	}
};

const onTouchEnd = (event) => {
	event.preventDefault();
	isDragging = false;
};

const onMouseMove = (event) => {
	const rect = event.target.getBoundingClientRect();
	mouseX = event.clientX - rect.left;
	mouseY = event.clientY - rect.top;

	if (isDragging && selectedImage) {
		const dx = mouseX - lastMouseX;
		const dy = mouseY - lastMouseY;
		selectedImage.x += dx;
		selectedImage.y += dy;
		needsRender = true;
	}

	lastMouseX = mouseX;
	lastMouseY = mouseY;
};

const onMouseDown = () => {
	isDragging = true;
	lastMouseX = mouseX;
	lastMouseY = mouseY;
	const clickedImage = getImageAtPosition(mouseX, mouseY);
	if (clickedImage !== selectedImage) {
		selectedImage = clickedImage;
		if (selectedImage) {
			selectedImage.initialX = selectedImage.x;
			selectedImage.initialY = selectedImage.y;
		}
		needsRender = true;
	}
};

const onMouseUp = () => {
	if (isDragging && selectedImage) {
		if (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY) {
			history.push({
				type: 'move',
				image: selectedImage,
				fromX: selectedImage.initialX,
				fromY: selectedImage.initialY
			});
		}
	}
	isDragging = false;
};

const onPaste = (event) => {
	const items = event.clipboardData.items;
	for (const item of items) {
		if (item.type.indexOf('image') === 0) {
			const blob = item.getAsFile();
			const reader = new FileReader();
			reader.onload = function (e) {
				const img = new Image();
				img.onload = function () {
					const image = createImage(renderer, img, mouseX, mouseY);
					scene.push(image);
					history.push({ type: 'add', image: image });
					needsRender = true;
				};
				img.src = e.target.result;
				console.log(e.target.result);
			};
			reader.readAsDataURL(blob);
			break;
		}
	}
};

const onKeyDown = (event) => {
	if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
		if (history.length === 0) return;

		const lastAction = history.pop();
		switch (lastAction.type) {
			case 'add':
				const index = scene.indexOf(lastAction.image);
				if (index !== -1) {
					scene.splice(index, 1);
				}
				break;
			case 'delete':
				scene.splice(lastAction.index, 0, lastAction.image);
				break;
			case 'move':
				lastAction.image.x = lastAction.fromX;
				lastAction.image.y = lastAction.fromY;
				break;
		}
		needsRender = true;
	}
	if (selectedImage) {
		if (event.key === 'Backspace' || event.key === 'Delete') {
			const index = scene.indexOf(selectedImage);
			if (index !== -1) {
				history.push({ type: 'delete', image: selectedImage, index: index });
				scene.splice(index, 1);
				selectedImage = null;
				needsRender = true;
			}
		}
	}
};

const onResize = () => {
	if (resizeRenderer(renderer)) {
		needsRender = true;
	}
};

const render = () => {
	if (needsRender) {
		clearRenderer(renderer);
		scene.forEach((object) => renderImage(renderer, object, object === selectedImage));
		needsRender = false;
	}
	requestAnimationFrame(render);
};

// Call onResize initially and add event listener
window.addEventListener('load', onResize);
window.addEventListener('resize', onResize);

init();
