import { Avatar } from '../../../components/Avatar';

export default function UserAvatar({ id, photo, name = '', size = 64 }) {
  return <Avatar id={id} photo={photo} name={name} size={size} className="up-user-avatar" />;
}
