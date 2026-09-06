import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

// Dropdown met interne gebruikers voor het toewijzen van een eigenaar aan een lead.
// Lukt het ophalen niet (bijv. geen rechten), dan blijft de huidige waarde gewoon kiesbaar.
export default function EigenaarSelect({ value, onChange, placeholder = 'Wie pakt de lead op' }) {
  const [gebruikers, setGebruikers] = useState([]);

  useEffect(() => {
    let actief = true;
    base44.entities.User.list()
      .then((lijst) => { if (actief) setGebruikers(lijst); })
      .catch(() => { /* geen gebruikerslijst beschikbaar: veld blijft bruikbaar */ });
    return () => { actief = false; };
  }, []);

  const opties = [...new Set([
    ...gebruikers.map((u) => u.full_name || u.email).filter(Boolean),
    ...(value ? [value] : []),
  ])];

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opties.map((naam) => (
          <SelectItem key={naam} value={naam}>{naam}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}