export class Scene {
  constructor() {
    this.objects = [];
  }

  add(object) {
    this.objects.push(object);
  }

  remove(object) {
    const index = this.objects.indexOf(object);
    if (index !== -1) {
      this.objects.splice(index, 1);
    }
  }
}

