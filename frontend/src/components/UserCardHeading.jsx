export default function UserCardHeading({ id, title, subtitle }) {
  return <div className="card-heading">
    <span className="key-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></svg></span>
    <div><h2 id={id}>{title}</h2><p>{subtitle}</p></div>
  </div>
}
