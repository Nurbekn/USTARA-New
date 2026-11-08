import { prepareImage } from "./imageUpload";

export function prepareProfilePhoto(file) {
  return prepareImage(file, { square: true, maxSide: 384 });
}
