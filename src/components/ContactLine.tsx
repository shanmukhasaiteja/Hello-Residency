import { contactHref } from '../lib/match';

/** Renders a contact as a link only when its scheme is safe; plain text otherwise. */
export function ContactLine({ contact }: { contact: string | undefined }) {
  if (!contact) return <p className="contact contact-missing">They haven't added contact details yet.</p>;
  const href = contactHref(contact);
  return (
    <p className="contact">
      <span className="contact-label">Contact</span>
      {href ? (
        <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer">
          {contact}
        </a>
      ) : (
        <span>{contact}</span>
      )}
    </p>
  );
}
