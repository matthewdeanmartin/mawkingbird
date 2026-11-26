import { invokeSocial } from './native-invoke';

/** Loaded only when attaching a picture, keeping upload code out of startup. */
export async function uploadPicture(handle: string, url: string, form: FormData) {
  const file = form.get('file');
  if (
    !(file instanceof File) ||
    !/^image\/(png|jpeg|gif|webp)$/.test(file.type) ||
    !file.size ||
    file.size > 16 * 1024 * 1024
  )
    throw {
      kind: 'policy',
      message:
        'Native uploads support PNG, JPEG, GIF and WebP pictures up to 16 MiB. Your server may have a lower limit.',
    };
  if (
    [...form.keys()].some((name) => name !== 'file' && name !== 'description') ||
    form.getAll('file').length !== 1 ||
    form.getAll('description').length > 1 ||
    (form.has('description') && typeof form.get('description') !== 'string')
  )
    throw { kind: 'policy', message: 'Unsupported picture upload fields.' };
  const description = String(form.get('description') ?? '');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the selected picture.'));
    reader.readAsDataURL(file);
  });
  return invokeSocial<{ status: number; body: string; headers: Record<string, string> }>(
    'mastodon_picture_upload',
    {
      handle,
      input: { url, mime: file.type, data, description },
    },
  );
}
