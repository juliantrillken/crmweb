import {render} from 'preact';
import {useState, useEffect, useCallback} from 'preact/hooks';
import {html} from 'htm/preact';
import * as XLSX from 'xlsx';

// --- DATA TYPES ---
interface Note {
  id: string;
  date: string;
  content: string;
  isFuture?: boolean;
}

interface AdditionalContact {
  id: string;
  name: string;
  email: string;
}

interface Customer {
  id: string;
  companyName: string;
  contactPerson: string;
  address: string;
  email: string;
  phone: string;
  source: string;
  lastContact: string;
  firstContact: string;
  industry: string;
  nextSteps: string;
  reminderDate: string | null;
  notes: Note[];
  sjSeen: boolean;
  info: string;
  inactive: boolean;
  additionalContacts: AdditionalContact[];
}

interface CompanySettings {
  companyName: string;
  logo: string | null;
}

type View = 'dashboard' | 'customerList' | 'customerForm' | 'settings' | 'doings';

// --- HELPER FUNCTIONS ---
const useLocalStorage = <T,>(key: string, initialValue: T): [T, (value: T | ((prevState: T) => T)) => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((prevState: T) => T)) => {
    try {
      setStoredValue(currentStoredValue => {
        const newValue = value instanceof Function ? value(currentStoredValue) : value;
        window.localStorage.setItem(key, JSON.stringify(newValue));
        return newValue;
      });
    } catch (error) {
      console.error(error);
    }
  }, [key]);

  return [storedValue, setValue];
};

const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid Date';
        return date.toLocaleDateString();
    } catch {
        return 'Invalid Date';
    }
}

const safeFormatDateForStorage = (dateInput: any): string => {
    if (!dateInput) {
        return new Date().toISOString().split('T')[0];
    }
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) {
        console.warn(`Invalid date value encountered during import: "${dateInput}". Falling back to today's date.`);
        return new Date().toISOString().split('T')[0];
    }
    return date.toISOString().split('T')[0];
};

// --- UI COMPONENTS ---

const Header = ({ settings, setView }: { settings: CompanySettings, setView: (view: View) => void }) => {
  return html`
    <header>
      <div class="logo-container">
        ${settings.logo && html`<img src=${settings.logo} alt="Company Logo" />`}
        <h1>${settings.companyName || 'CRM Pro'}</h1>
      </div>
      <nav>
        <button onClick=${() => setView('dashboard')}>Dashboard</button>
        <button onClick=${() => setView('settings')}>Einstellungen</button>
      </nav>
    </header>
  `;
};

const QuickNote = ({ customers, saveCustomer }: { customers: Customer[], saveCustomer: (customer: Customer) => void }) => {
    const [noteContent, setNoteContent] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);

    const searchResults = searchTerm
        ? customers.filter(c =>
            !c.inactive && c.companyName.toLowerCase().includes(searchTerm.toLowerCase())
          ).slice(0, 5)
        : [];

    const handleSelectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        setSearchTerm('');
    };

    const handleSaveNote = () => {
        if (!selectedCustomer || !noteContent.trim()) return;

        const updatedCustomer: Customer = {
            ...selectedCustomer,
            lastContact: new Date().toISOString().split('T')[0],
            notes: [
                ...(selectedCustomer.notes || []),
                {
                    id: crypto.randomUUID(),
                    date: new Date().toISOString(),
                    content: noteContent.trim(),
                    isFuture: false
                }
            ]
        };
        saveCustomer(updatedCustomer);

        setNoteContent('');
        setSelectedCustomer(null);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2500);
    };

    return html`
        <div class="card quick-note-card">
            <h2>Schnellnotiz</h2>
            <div class="form-group">
                <label for="quickNoteContent">Notiz</label>
                <textarea id="quickNoteContent" rows="3" value=${noteContent} onInput=${(e: Event) => setNoteContent((e.target as HTMLTextAreaElement).value)} placeholder="Was wurde besprochen? Welche Aktion wurde durchgeführt?"></textarea>
            </div>
            <div class="form-group">
                <label for="customerSearch">Kunde</label>
                ${selectedCustomer ? html`
                    <div class="selected-customer">
                        <span>${selectedCustomer.companyName}</span>
                        <button onClick=${() => setSelectedCustomer(null)} class="btn-clear-selection" title="Auswahl aufheben">×</button>
                    </div>
                ` : html`
                    <div class="customer-search-container">
                        <input
                            type="text"
                            id="customerSearch"
                            placeholder="Kunden suchen..."
                            value=${searchTerm}
                            onInput=${(e: Event) => setSearchTerm((e.target as HTMLInputElement).value)}
                        />
                        ${searchResults.length > 0 && html`
                            <ul class="search-results">
                                ${searchResults.map(c => html`
                                    <li key=${c.id} onClick=${() => handleSelectCustomer(c)}>${c.companyName}</li>
                                `)}
                            </ul>
                        `}
                    </div>
                `}
            </div>
            <div class="form-actions" style=${{justifyContent: 'flex-end', marginTop: '1rem', borderTop: 'none', paddingTop: 0}}>
                 ${showSuccess && html`<span class="success-message">Notiz gespeichert!</span>`}
                 <button class="btn btn-primary" onClick=${handleSaveNote} disabled=${!selectedCustomer || !noteContent.trim()}>Speichern</button>
            </div>
        </div>
    `;
};


const Dashboard = ({ setView, setEditingCustomerId, customers, saveCustomer }: { setView: (view: View) => void; setEditingCustomerId: (id: string | null) => void; customers: Customer[]; saveCustomer: (customer: Customer) => void }) => {
    const upcomingDoings = customers
        .filter(c => c.reminderDate && !c.inactive)
        .sort((a, b) => new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime())
        .slice(0, 5);

  return html`
    <div class="dashboard-grid">
        <div class="card">
          <h2>Willkommen zurück!</h2>
          <p>Verwalten Sie Ihre Kundenbeziehungen effizient und einfach.</p>
          <div class="dashboard-actions" style=${{ marginTop: '1.5rem' }}>
            <button class="btn btn-primary" onClick=${() => { setEditingCustomerId(null); setView('customerForm'); }}>
              Neuen Kunden anlegen
            </button>
            <button class="btn btn-secondary" onClick=${() => setView('customerList')}>
              Kundenliste anzeigen
            </button>
             <button class="btn btn-secondary" onClick=${() => setView('doings')}>
              Offene Doings
            </button>
          </div>
        </div>
        <div class="card">
            <h2>Nächste 5 offene Doings</h2>
            ${upcomingDoings.length > 0 ? html`
                <ul class="upcoming-doings-list">
                    ${upcomingDoings.map(customer => {
                        const isOverdue = new Date(customer.reminderDate!) < new Date();
                        return html`
                            <li class="upcoming-doings-item" onClick=${() => { setEditingCustomerId(customer.id); setView('customerForm'); }}>
                                <div class="upcoming-doings-item-info">
                                    <strong>${customer.companyName}</strong>
                                    <small>${customer.nextSteps}</small>
                                </div>
                                <span class="upcoming-doings-item-date ${isOverdue ? 'overdue' : ''}">${formatDate(customer.reminderDate)}</span>
                            </li>
                        `;
                    })}
                </ul>
            ` : html`
                <p>Keine bevorstehenden Aufgaben. Gut gemacht!</p>
            `}
        </div>
        <${QuickNote} customers=${customers} saveCustomer=${saveCustomer} />
    </div>
  `;
};

const Doings = ({ customers, saveCustomer, setView, setEditingCustomerId }: { customers: Customer[], saveCustomer: (customer: Customer) => void, setView: (view: View) => void, setEditingCustomerId: (id: string) => void }) => {
    const openTasks = customers
        .filter(c => c.reminderDate && !c.inactive)
        .sort((a, b) => new Date(a.reminderDate!).getTime() - new Date(b.reminderDate!).getTime());

    const handleComplete = (customer: Customer) => {
        const updatedCustomer: Customer = {
            ...customer,
            reminderDate: null,
            notes: [
                ...(customer.notes || []),
                {
                    id: crypto.randomUUID(),
                    date: new Date().toISOString(),
                    content: `Aufgabe erledigt: ${customer.nextSteps}`
                }
            ],
            lastContact: new Date().toISOString().split('T')[0]
        };
        saveCustomer(updatedCustomer);
    };

    const handleReschedule = (customer: Customer, days: number) => {
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + days);
        const updatedCustomer: Customer = {
            ...customer,
            reminderDate: newDate.toISOString().split('T')[0]
        };
        saveCustomer(updatedCustomer);
    };
    
    if (openTasks.length === 0) {
        return html`
            <div class="empty-state card">
                <h3>Keine offenen Aufgaben</h3>
                <p>Sie haben alle Ihre Aufgaben erledigt. Gut gemacht!</p>
                <button class="btn btn-secondary" onClick=${() => setView('dashboard')}>
                  Zurück zum Dashboard
                </button>
            </div>
        `;
    }

    return html`
        <div class="card">
            <h2>Offene Doings (${openTasks.length})</h2>
            <div class="doings-list">
                ${openTasks.map(customer => {
                    const isOverdue = new Date(customer.reminderDate!) < new Date();
                    return html`
                        <div class="doing-item card ${isOverdue ? 'overdue-doing' : ''}">
                            <div class="doing-item-header">
                                <h3><a href="#" onClick=${(e: MouseEvent) => { e.preventDefault(); setEditingCustomerId(customer.id); setView('customerForm'); }}>${customer.companyName}</a></h3>
                                <span class="doing-date ${isOverdue ? 'overdue' : ''}">Fällig: ${formatDate(customer.reminderDate)}</span>
                            </div>
                            <p>${customer.nextSteps}</p>
                            <div class="doing-actions">
                                <span>Neu terminieren:</span>
                                <button class="btn btn-secondary btn-sm" onClick=${() => handleReschedule(customer, 7)}>1 Woche</button>
                                <button class="btn btn-secondary btn-sm" onClick=${() => handleReschedule(customer, 14)}>2 Wochen</button>
                                <div class="doing-actions-right">
                                    <button class="btn btn-success" onClick=${() => handleComplete(customer)}>Erledigt</button>
                                </div>
                            </div>
                        </div>
                    `;
                })}
            </div>
        </div>
    `;
};

const CustomerList = ({ customers, setView, setEditingCustomerId, deleteCustomer }: { customers: Customer[], setView: (view: View) => void; setEditingCustomerId: (id: string | null) => void; deleteCustomer: (id: string) => void; }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterSource, setFilterSource] = useState('');
    const [filterIndustry, setFilterIndustry] = useState('');
    const [filterReminder, setFilterReminder] = useState(false);
    const [sortBy, setSortBy] = useState('lastContact');
    const [showInactive, setShowInactive] = useState(false);
    
    const filteredCustomers = customers.filter(customer => {
      if (showInactive) {
          if (!customer.inactive) return false;
      } else {
          if (customer.inactive) return false;
      }
      
      if (searchTerm) {
          const lowerSearchTerm = searchTerm.toLowerCase();
          const searchIn = [
              customer.companyName,
              customer.contactPerson,
              customer.email,
              customer.industry,
              ...(customer.additionalContacts || []).map(c => `${c.name} ${c.email}`)
          ].join(' ').toLowerCase();
          if (!searchIn.includes(lowerSearchTerm)) return false;
      }

      if (filterSource && customer.source !== filterSource) return false;
      if (filterIndustry && !customer.industry.toLowerCase().includes(filterIndustry.toLowerCase())) return false;
      if (filterReminder && !customer.reminderDate) return false;
      return true;
    });

    const sortedCustomers = [...filteredCustomers].sort((a, b) => {
        switch(sortBy) {
            case 'companyName':
                return a.companyName.localeCompare(b.companyName);
            case 'firstContact':
                return new Date(b.firstContact).getTime() - new Date(a.firstContact).getTime();
            case 'lastContact':
            default:
                return new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime();
        }
    });

    if (customers.length === 0) {
        return html`
            <div class="empty-state card">
                <h3>Keine Kunden gefunden</h3>
                <p>Legen Sie Ihren ersten Kunden an, um loszulegen.</p>
                <button class="btn btn-primary" onClick=${() => { setEditingCustomerId(null); setView('customerForm'); }}>
                  Neuen Kunden anlegen
                </button>
            </div>
        `;
    }

  return html`
    <div class="card">
      <div class="customer-list-header">
        <h2>${showInactive ? 'Inaktive Kunden' : 'Aktive Kunden'}</h2>
        <div>
            <button class="btn btn-secondary" onClick=${() => setShowInactive(!showInactive)}>
                ${showInactive ? 'Aktive Kunden anzeigen' : 'Inaktive Kunden anzeigen'}
            </button>
            <button class="btn btn-primary" onClick=${() => { setEditingCustomerId(null); setView('customerForm'); }}>
                Neuen Kunden anlegen
            </button>
        </div>
      </div>

       <div class="filter-container">
        <div class="form-group search-group">
          <label for="searchTerm">Suche</label>
          <input type="text" id="searchTerm" placeholder="Firma, Person, E-Mail..." value=${searchTerm} onInput=${(e: Event) => setSearchTerm((e.target as HTMLInputElement).value)} />
        </div>
        <div class="form-group">
          <label for="filterSource">Quelle</label>
          <select id="filterSource" value=${filterSource} onChange=${(e: Event) => setFilterSource((e.target as HTMLSelectElement).value)}>
            <option value="">Alle</option>
            <option value="Google">Google</option>
            <option value="Empfehlung">Empfehlung</option>
            <option value="Messe">Messe</option>
            <option value="Sonstiges">Sonstiges</option>
          </select>
        </div>
        <div class="form-group">
          <label for="filterIndustry">Branche</label>
          <input type="text" id="filterIndustry" placeholder="Branche suchen..." value=${filterIndustry} onInput=${(e: Event) => setFilterIndustry((e.target as HTMLInputElement).value)} />
        </div>
        <div class="form-group">
            <label>Filter</label>
            <div class="checkbox-group">
                <input type="checkbox" id="filterReminder" checked=${filterReminder} onChange=${(e: Event) => setFilterReminder((e.target as HTMLInputElement).checked)} />
                <label for="filterReminder">Nur mit Reminder</label>
            </div>
        </div>
        <div class="form-group">
            <label for="sortBy">Sortieren nach</label>
            <select id="sortBy" value=${sortBy} onChange=${(e: Event) => setSortBy((e.target as HTMLSelectElement).value)}>
                <option value="lastContact">Letzter Kontakt</option>
                <option value="companyName">Firma</option>
                <option value="firstContact">Erstkontakt</option>
            </select>
        </div>
      </div>

      <div style=${{ overflowX: 'auto' }}>
        <table class="customer-table">
          <thead>
            <tr>
              <th>Firma</th>
              <th>Ansprechpartner</th>
              <th>Letzter Kontakt</th>
              <th>Nächste Schritte / Reminder</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${sortedCustomers.map(customer => {
              const isOverdue = customer.reminderDate && new Date(customer.reminderDate) < new Date();
              const threeMonthsAgo = new Date();
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
              const isOldContact = new Date(customer.lastContact) < threeMonthsAgo;

              return html`
                <tr key=${customer.id} class=${isOldContact ? 'old-contact' : ''}>
                  <td>
                    <a href="#" class="customer-name-link" onClick=${(e: MouseEvent) => { e.preventDefault(); setEditingCustomerId(customer.id); setView('customerForm'); }}>
                        ${customer.companyName}
                    </a><br/>
                    <small>${customer.industry}</small>
                  </td>
                  <td>
                    ${customer.contactPerson} 
                    ${customer.email && !showInactive && html`<a href="mailto:${customer.email}" class="email-icon" title=${`E-Mail an ${customer.contactPerson}`}>📧</a>`}
                    <br/><small>${customer.email}</small>
                  </td>
                  <td>${formatDate(customer.lastContact)}</td>
                  <td>
                    ${customer.nextSteps}
                    ${customer.reminderDate && html`
                        <div class="reminder ${isOverdue ? 'overdue' : ''}">
                           <span>📅</span> ${formatDate(customer.reminderDate)}
                        </div>
                    `}
                  </td>
                  <td>
                    <div class="actions">
                        <button class="btn btn-secondary" onClick=${() => { setEditingCustomerId(customer.id); setView('customerForm'); }}>Bearbeiten</button>
                        <button class="btn btn-danger" onClick=${() => {
                            if (window.confirm('Sind Sie sicher, dass Sie diesen Kunden endgültig löschen möchten?')) {
                                deleteCustomer(customer.id);
                            }
                        }}>Löschen</button>
                    </div>
                  </td>
                </tr>
              `
            })}
          </tbody>
        </table>
         ${sortedCustomers.length === 0 && html`<p style=${{textAlign: 'center', padding: '2rem'}}>Keine Kunden entsprechen Ihren Filterkriterien.</p>`}
      </div>
    </div>
  `;
};


const CustomerForm = ({ saveCustomer, setView, editingCustomerId, customers, deleteCustomer, setIsFormDirty }: { saveCustomer: (customer: Customer) => void, setView: (view: View, options?: { force?: boolean }) => void; editingCustomerId: string | null, customers: Customer[], deleteCustomer: (id: string) => void, setIsFormDirty: (dirty: boolean) => void }) => {
  const customer = customers.find(c => c.id === editingCustomerId);
  
  const [activeTab, setActiveTab] = useState('info');
  const [newNote, setNewNote] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');


  const [formData, setFormData] = useState<Omit<Customer, 'id' | 'notes'>>({
    companyName: customer?.companyName || '',
    contactPerson: customer?.contactPerson || '',
    address: customer?.address || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    source: customer?.source || 'Google',
    lastContact: customer?.lastContact || new Date().toISOString().split('T')[0],
    firstContact: customer?.firstContact || new Date().toISOString().split('T')[0],
    industry: customer?.industry || '',
    nextSteps: customer?.nextSteps || '',
    reminderDate: customer?.reminderDate || null,
    sjSeen: customer?.sjSeen || false,
    info: customer?.info || '',
    inactive: customer?.inactive || false,
    additionalContacts: customer?.additionalContacts || [],
  });

  useEffect(() => {
    // When the customer prop changes, update the form data and reset dirty state
    setFormData({
      companyName: customer?.companyName || '',
      contactPerson: customer?.contactPerson || '',
      address: customer?.address || '',
      email: customer?.email || '',
      phone: customer?.phone || '',
      source: customer?.source || 'Google',
      lastContact: customer?.lastContact || new Date().toISOString().split('T')[0],
      firstContact: customer?.firstContact || new Date().toISOString().split('T')[0],
      industry: customer?.industry || '',
      nextSteps: customer?.nextSteps || '',
      reminderDate: customer?.reminderDate || null,
      sjSeen: customer?.sjSeen || false,
      info: customer?.info || '',
      inactive: customer?.inactive || false,
      additionalContacts: customer?.additionalContacts || [],
    });
    setIsFormDirty(false);
  }, [customer]);


  const handleChange = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const name = target.name;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    setFormData(prev => ({ ...prev, [name]: value }));
    setIsFormDirty(true);
  };
  
  const handleReminderChange = (days: number | null) => {
    if (days === null) {
      setFormData(prev => ({ ...prev, reminderDate: null }));
      setIsFormDirty(true);
      return;
    }
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFormData(prev => ({ ...prev, reminderDate: date.toISOString().split('T')[0] }));
    setIsFormDirty(true);
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!formData.companyName) {
        alert('Firmenname ist ein Pflichtfeld.');
        return;
    }
    const id = editingCustomerId || crypto.randomUUID();
    const existingNotes = customers.find(c => c.id === id)?.notes || [];
    saveCustomer({ id, ...formData, notes: existingNotes });
    setView('customerList', { force: true });
  };
  
  const handleDelete = () => {
    if (editingCustomerId && window.confirm('Sind Sie sicher, dass Sie diesen Kunden endgültig löschen möchten?')) {
        deleteCustomer(editingCustomerId);
        setView('customerList', { force: true });
    }
  };
  
  const handleAddNote = () => {
    if (!newNote.trim() || !customer) return;
    const updatedCustomer: Customer = {
        ...customer,
        lastContact: new Date().toISOString().split('T')[0],
        notes: [
            ...(customer.notes || []),
            {
                id: crypto.randomUUID(),
                date: new Date().toISOString(),
                content: newNote
            }
        ]
    };
    saveCustomer(updatedCustomer);
    setNewNote('');
    setIsFormDirty(false);
  };

  const handleEditNoteDate = (note: Note) => {
    setEditingNoteId(note.id);
    const localDate = new Date(note.date);
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
    setEditingDate(localDate.toISOString().slice(0, 16));
  };

  const handleSaveNoteDate = (noteId: string) => {
    if (!customer || !editingDate) return;
    const updatedNotes = customer.notes.map(note => 
      note.id === noteId ? { ...note, date: new Date(editingDate).toISOString() } : note
    );
    
    let newLastContact = customer.lastContact;
    if (updatedNotes.length > 0) {
        // Sort notes by date descending to find the latest one
        const sortedNotes = [...updatedNotes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        newLastContact = sortedNotes[0].date.split('T')[0];
    }
    
    const updatedCustomer = { ...customer, notes: updatedNotes, lastContact: newLastContact };
    saveCustomer(updatedCustomer);
    setEditingNoteId(null);
    setEditingDate('');
    setIsFormDirty(false);
  };

  const handleAddContact = () => {
    if (!newContactName.trim()) {
        alert('Bitte geben Sie einen Namen für den Ansprechpartner ein.');
        return;
    }
    const newContact: AdditionalContact = {
        id: crypto.randomUUID(),
        name: newContactName.trim(),
        email: newContactEmail.trim(),
    };
    setFormData(prev => ({
        ...prev,
        additionalContacts: [...(prev.additionalContacts || []), newContact]
    }));
    setNewContactName('');
    setNewContactEmail('');
    setIsFormDirty(true);
  };

  const handleDeleteContact = (id: string) => {
    setFormData(prev => ({
        ...prev,
        additionalContacts: (prev.additionalContacts || []).filter(contact => contact.id !== id)
    }));
    setIsFormDirty(true);
  };
  
  const getCombinedHistory = () => {
      if (!customer) return [];
      const historyItems: Note[] = [...(customer.notes || [])];
      
      if (customer.nextSteps && customer.reminderDate) {
          historyItems.push({
              id: 'reminder',
              date: customer.reminderDate,
              content: `Nächste Aufgabe: ${customer.nextSteps}`,
              isFuture: true,
          });
      }
      
      return historyItems.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  return html`
    <div class="card">
        <h2>${editingCustomerId ? `Kunde: ${customer?.companyName}` : 'Neuen Kunden anlegen'}</h2>
        
        ${editingCustomerId && html`
            <div class="tabs">
                <button class="tab-link ${activeTab === 'info' ? 'active' : ''}" onClick=${() => setActiveTab('info')}>Kundeninformationen</button>
                <button class="tab-link ${activeTab === 'history' ? 'active' : ''}" onClick=${() => setActiveTab('history')}>Historie</button>
            </div>
        `}

        <div style=${{display: !editingCustomerId || activeTab === 'info' ? 'block' : 'none'}}>
            <form onSubmit=${handleSubmit} class="tab-content">
                <div style=${{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem'}}>
                    <div class="form-group">
                        <label for="companyName">Firmenname *</label>
                        <input type="text" id="companyName" name="companyName" value=${formData.companyName} onInput=${handleChange} required />
                    </div>
                    <div class="form-group">
                        <label for="contactPerson">Ansprechpartner</label>
                        <input type="text" id="contactPerson" name="contactPerson" value=${formData.contactPerson} onInput=${handleChange} />
                    </div>
                     <div class="form-group">
                        <label for="email">E-Mail</label>
                        <input type="email" id="email" name="email" value=${formData.email} onInput=${handleChange} />
                    </div>
                    <div class="form-group">
                        <label for="phone">Telefonnummer</label>
                        <input type="tel" id="phone" name="phone" value=${formData.phone} onInput=${handleChange} />
                    </div>
                </div>

                <div class="additional-contacts-section">
                    <h4>Weitere Ansprechpartner</h4>
                    ${formData.additionalContacts && formData.additionalContacts.length > 0 ? html`
                        <div class="additional-contacts-list">
                            ${formData.additionalContacts.map(contact => html`
                                <div key=${contact.id} class="additional-contacts-list-item">
                                    <div>
                                        <strong>${contact.name}</strong><br/>
                                        <small>${contact.email}</small>
                                    </div>
                                    <button type="button" class="btn btn-danger btn-sm" onClick=${() => handleDeleteContact(contact.id)}>Löschen</button>
                                </div>
                            `)}
                        </div>
                    ` : html`
                        <p class="text-light">Keine weiteren Ansprechpartner hinzugefügt.</p>
                    `}
                    <div class="add-contact-form">
                        <div class="form-group">
                            <input type="text" placeholder="Name" value=${newContactName} onInput=${(e: Event) => setNewContactName((e.target as HTMLInputElement).value)} />
                        </div>
                        <div class="form-group">
                            <input type="email" placeholder="E-Mail" value=${newContactEmail} onInput=${(e: Event) => setNewContactEmail((e.target as HTMLInputElement).value)} />
                        </div>
                        <button type="button" class="btn btn-secondary" onClick=${handleAddContact}>Hinzufügen</button>
                    </div>
                </div>

                 <div class="form-group">
                    <label for="address">Adresse</label>
                    <textarea id="address" name="address" onInput=${handleChange}>${formData.address}</textarea>
                </div>
                <div style=${{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem'}}>
                    <div class="form-group">
                        <label for="source">Woher kommt der Kunde?</label>
                        <select id="source" name="source" value=${formData.source} onChange=${handleChange}>
                            <option value="Google">Google</option>
                            <option value="Empfehlung">Empfehlung</option>
                            <option value="Messe">Messe</option>
                            <option value="Sonstiges">Sonstiges</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label for="firstContact">Erstkontakt</label>
                        <input type="date" id="firstContact" name="firstContact" value=${formData.firstContact} onInput=${handleChange} />
                    </div>
                    <div class="form-group">
                        <label for="lastContact">Letzter Kontakt</label>
                        <input type="date" id="lastContact" name="lastContact" value=${formData.lastContact} onInput=${handleChange} />
                    </div>
                </div>
                <div class="form-group">
                    <label for="industry">Branche des Kunden</label>
                    <input type="text" id="industry" name="industry" value=${formData.industry} onInput=${handleChange} />
                </div>
                 <div class="form-group">
                    <label for="info">Infos</label>
                    <textarea id="info" name="info" onInput=${handleChange}>${formData.info}</textarea>
                </div>
                <div class="form-group">
                    <label for="nextSteps">Was soll als nächstes gemacht werden / worauf warten wir?</label>
                    <textarea id="nextSteps" name="nextSteps" onInput=${handleChange}>${formData.nextSteps}</textarea>
                </div>
                 <div class="form-group">
                    <div class="checkbox-group" style=${{ height: 'auto', gap: '2rem' }}>
                        <div class="checkbox-item">
                            <input type="checkbox" id="sjSeen" name="sjSeen" checked=${formData.sjSeen} onChange=${handleChange} />
                            <label for="sjSeen">SJ gesehen</label>
                        </div>
                         <div class="checkbox-item">
                            <input type="checkbox" id="inactive" name="inactive" checked=${formData.inactive} onChange=${handleChange} />
                            <label for="inactive">Kunde inaktiv</label>
                        </div>
                    </div>
                </div>
                <div class="form-group">
                    <label>Reminder für eine Aufgabe</label>
                    <div style=${{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <button type="button" class="btn btn-secondary" onClick=${() => handleReminderChange(7)}>1 Woche</button>
                        <button type="button" class="btn btn-secondary" onClick=${() => handleReminderChange(14)}>2 Wochen</button>
                        <button type="button" class="btn btn-secondary" onClick=${() => handleReminderChange(28)}>4 Wochen</button>
                        <input type="date" name="reminderDate" value=${formData.reminderDate || ''} onInput=${handleChange} />
                        ${formData.reminderDate && html`<button type="button" class="btn btn-danger" onClick=${() => handleReminderChange(null)}>Löschen</button>`}
                    </div>
                </div>
                <div class="form-actions">
                     ${editingCustomerId && html`
                        <button type="button" class="btn btn-danger" onClick=${handleDelete} style=${{ marginRight: 'auto' }}>Kunde löschen</button>
                    `}
                    <button type="submit" class="btn btn-primary">Speichern</button>
                    ${editingCustomerId && formData.email && html`<a href="mailto:${formData.email}" class="btn btn-secondary">Neue E-Mail</a>`}
                    <button type="button" class="btn btn-secondary" onClick=${() => setView('customerList')}>Abbrechen</button>
                </div>
            </form>
        </div>

        <div style=${{display: editingCustomerId && activeTab === 'history' ? 'block' : 'none'}}>
            <div class="tab-content">
                <h3>Historie</h3>
                <div class="history-list">
                    ${getCombinedHistory().length > 0 ? getCombinedHistory().map(note => html`
                        <div class="history-item ${note.isFuture ? 'future-item' : ''}">
                            ${editingNoteId === note.id ? html`
                                <div class="history-item-edit">
                                    <input type="datetime-local" value=${editingDate} onInput=${(e: Event) => { setEditingDate((e.target as HTMLInputElement).value); setIsFormDirty(true); }} />
                                    <button class="btn btn-success btn-sm" onClick=${() => handleSaveNoteDate(note.id)}>Speichern</button>
                                    <button class="btn btn-secondary btn-sm" onClick=${() => setEditingNoteId(null)}>Abbrechen</button>
                                </div>
                            ` : html`
                                <strong>
                                    ${new Date(note.date).toLocaleString()}
                                    ${!note.isFuture && html`<button class="btn-edit-date" onClick=${() => handleEditNoteDate(note)}>📅</button>`}
                                </strong>
                            `}
                            <p>${note.content}</p>
                        </div>
                    `) : html`<p>Keine Einträge in der Historie vorhanden.</p>`}
                </div>
                <div class="add-note-form">
                    <h4>Neuen Eintrag hinzufügen</h4>
                    <div class="form-group">
                        <textarea 
                            rows="4" 
                            placeholder="Was wurde besprochen? Welche Aktion wurde durchgeführt?"
                            value=${newNote}
                            onInput=${(e: Event) => { setNewNote((e.target as HTMLTextAreaElement).value); setIsFormDirty(true); }}
                        ></textarea>
                    </div>
                    <button class="btn btn-primary" onClick=${handleAddNote} disabled=${!newNote.trim()}>Eintrag speichern</button>
                </div>
                 <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onClick=${() => setView('customerList')}>Zurück zur Liste</button>
                 </div>
            </div>
        </div>
    </div>
  `;
};

const Settings = ({ settings, setSettings, setView, customers, setCustomers }: { settings: CompanySettings; setSettings: (value: CompanySettings | ((prev: CompanySettings) => CompanySettings)) => void; setView: (v: View) => void; customers: Customer[]; setCustomers: (value: Customer[] | ((prev: Customer[]) => Customer[])) => void; }) => {
    const [importSuccess, setImportSuccess] = useState(false);
    
    useEffect(() => {
        if (importSuccess) {
            alert('Daten erfolgreich importiert! Die Anwendung wurde aktualisiert.');
            setView('dashboard');
            setImportSuccess(false);
        }
    }, [importSuccess, setView]);

    const handleNameChange = (e: Event) => {
        const { value } = e.target as HTMLInputElement;
        setSettings({ ...settings, companyName: value });
    };

    const handleLogoChange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setSettings({ ...settings, logo: event.target?.result as string });
            };
            reader.readAsDataURL(file);
        }
    };
    
    const handleCsvImport = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                let newCustomers: Customer[] = [];
                const fileName = file.name.toLowerCase();

                if (fileName.endsWith('.csv')) {
                    const csv = data as string;
                    const lines = csv.split('\n').slice(1);
                    lines.forEach(line => {
                        if (!line.trim()) return;
                        const fields = line.split(',').map(field => field.trim().replace(/"/g, ''));
                        const [companyName, contactPerson, address, email, phone, source, industry, nextSteps, firstContact, lastContact, sjSeen, info] = fields;
                        
                        if (companyName) {
                            newCustomers.push({
                                id: crypto.randomUUID(),
                                companyName,
                                contactPerson: contactPerson || '',
                                address: address || '',
                                email: email || '',
                                phone: phone || '',
                                source: source || 'Sonstiges',
                                industry: industry || '',
                                nextSteps: nextSteps || '',
                                firstContact: safeFormatDateForStorage(firstContact),
                                lastContact: safeFormatDateForStorage(lastContact),
                                sjSeen: sjSeen?.toLowerCase() === 'ja' || sjSeen?.toLowerCase() === 'yes',
                                info: info || '',
                                inactive: false,
                                reminderDate: null,
                                notes: [],
                                additionalContacts: [],
                            });
                        }
                    });
                } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

                    jsonData.forEach(row => {
                        const companyName = row.companyName || row.CompanyName;
                        if (companyName) {
                            newCustomers.push({
                                id: crypto.randomUUID(),
                                companyName: String(companyName),
                                contactPerson: String(row.contactPerson || row.ContactPerson || ''),
                                address: String(row.address || row.Address || ''),
                                email: String(row.email || row.Email || ''),
                                phone: String(row.phone || row.Phone || ''),
                                source: String(row.source || row.Source || 'Sonstiges'),
                                industry: String(row.industry || row.Industry || ''),
                                nextSteps: String(row.nextSteps || row.NextSteps || ''),
                                firstContact: safeFormatDateForStorage(row.firstContact || row.FirstContact),
                                lastContact: safeFormatDateForStorage(row.lastContact || row.LastContact),
                                sjSeen: String(row.sjSeen || row.SjSeen || '').toLowerCase() === 'ja' || String(row.sjSeen || row.SjSeen || '').toLowerCase() === 'yes',
                                info: String(row.info || row.Info || ''),
                                inactive: false,
                                reminderDate: null,
                                notes: [],
                                additionalContacts: [],
                            });
                        }
                    });
                }

                if(newCustomers.length > 0) {
                     setCustomers(prev => [...prev, ...newCustomers]);
                     alert(`${newCustomers.length} Kunden erfolgreich importiert!`);
                } else {
                    alert('Keine gültigen Kunden zum Importieren gefunden. Bitte prüfen Sie das Dateiformat und den Inhalt.');
                }
            } catch (error) {
                console.error("Import Error:", error);
                alert(`Ein Fehler ist beim Importieren aufgetreten: ${error.message}`);
            }
        };

        if (file.name.toLowerCase().endsWith('.csv')) {
             reader.readAsText(file);
        } else {
             reader.readAsArrayBuffer(file);
        }
    };
    
    const handleExport = () => {
      try {
        const dataToExport = {
          customers: customers,
          settings: settings
        };
        const jsonString = JSON.stringify(dataToExport, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `crm_data_backup_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Export Error:", error);
        alert(`Ein Fehler ist beim Exportieren aufgetreten: ${error.message}`);
      }
    };

    const handleJsonImport = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                const data = JSON.parse(text);

                if (data && Array.isArray(data.customers) && data.settings) {
                    if (window.confirm('Möchten Sie wirklich die aktuellen Daten mit dem Inhalt dieser Datei überschreiben? Diese Aktion kann nicht rückgängig gemacht werden.')) {
                        setCustomers(data.customers);
                        setSettings(data.settings);
                        setImportSuccess(true);
                    }
                } else {
                    throw new Error('Ungültiges Dateiformat. Die Datei muss ein Objekt mit den Schlüsseln "customers" (Array) und "settings" (Objekt) enthalten.');
                }
            } catch (error) {
                console.error("JSON Import Error:", error);
                alert(`Fehler beim Importieren der JSON-Datei: ${error.message}`);
            } finally {
                 (e.target as HTMLInputElement).value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleExcelExport = () => {
        try {
            const dataForExport = customers.map(customer => ({
                companyName: customer.companyName,
                contactPerson: customer.contactPerson,
                address: customer.address,
                email: customer.email,
                phone: customer.phone,
                source: customer.source,
                industry: customer.industry,
                nextSteps: customer.nextSteps,
                firstContact: customer.firstContact,
                lastContact: customer.lastContact,
                sjSeen: customer.sjSeen ? 'ja' : 'nein',
                info: customer.info,
            }));

            const worksheet = XLSX.utils.json_to_sheet(dataForExport);
            worksheet['!cols'] = [
                {wch: 25}, {wch: 20}, {wch: 30}, {wch: 25}, {wch: 15}, 
                {wch: 15}, {wch: 20}, {wch: 30}, {wch: 12}, {wch: 12},
                {wch: 8}, {wch: 40}
            ];
            
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Kunden");
            
            const date = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `crm_kunden_export_${date}.xlsx`);

        } catch (error) {
            console.error("Excel Export Error:", error);
            alert(`Ein Fehler ist beim Exportieren aufgetreten: ${error.message}`);
        }
    };

    const handleCsvExport = () => {
        try {
            const headers = [
                'companyName', 'contactPerson', 'address', 'email', 'phone', 
                'source', 'industry', 'nextSteps', 'firstContact', 'lastContact', 
                'sjSeen', 'info'
            ];

            const escapeCsvField = (field) => {
                const stringField = String(field ?? '');
                if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
                    return `"${stringField.replace(/"/g, '""')}"`;
                }
                return stringField;
            };

            const csvRows = customers.map(customer => {
                const row = [
                    customer.companyName,
                    customer.contactPerson,
                    customer.address,
                    customer.email,
                    customer.phone,
                    customer.source,
                    customer.industry,
                    customer.nextSteps,
                    customer.firstContact,
                    customer.lastContact,
                    customer.sjSeen ? 'ja' : 'nein',
                    customer.info,
                ];
                return row.map(escapeCsvField).join(',');
            });

            const csvString = [headers.join(','), ...csvRows].join('\n');
            
            const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const date = new Date().toISOString().split('T')[0];
            a.download = `crm_kunden_export_${date}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error("CSV Export Error:", error);
            alert(`Ein Fehler ist beim Exportieren aufgetreten: ${error.message}`);
        }
    };


    return html`
      <div class="card">
        <h2>Einstellungen</h2>
        <div class="form-group">
            <label for="companyName">Eigene Firma</label>
            <input type="text" id="companyName" value=${settings.companyName} onInput=${handleNameChange} />
        </div>
        <div class="form-group">
            <label for="logoUpload">Firmenlogo hochladen</label>
            <input type="file" id="logoUpload" accept="image/*" onChange=${handleLogoChange} />
            ${settings.logo && html`<img src=${settings.logo} alt="Logo preview" style=${{ height: '50px', marginTop: '1rem' }} />`}
        </div>

        <div class="import-section">
            <h3>Daten sichern & wiederherstellen</h3>
            <p>Exportieren Sie alle Ihre CRM-Daten (Kunden & Einstellungen) in eine einzelne JSON-Datei als Backup. Diese Datei können Sie später wieder importieren.</p>
            <div class="form-group">
                <button class="btn btn-secondary" onClick=${handleExport}>Daten exportieren (.json)</button>
            </div>
             <div class="form-group">
                <label for="jsonImport">Backup-Datei importieren (.json)</label>
                <input type="file" id="jsonImport" accept=".json,application/json" onChange=${handleJsonImport} />
            </div>
        </div>

        <div class="import-section">
            <h3>Kunden importieren & exportieren (Excel/CSV)</h3>
            <p>Importieren Sie eine CSV-, XLS- oder XLSX-Datei mit Ihren bestehenden Kundendaten. Die Spaltenüberschriften müssen sein:</p>
            <p><code>companyName, contactPerson, address, email, phone, source, industry, nextSteps, firstContact, lastContact, sjSeen, info</code></p>
            <p><small>Hinweis: 'sjSeen' sollte 'ja' oder 'nein' sein. Datumsfelder (firstContact, lastContact) sollten im Format YYYY-MM-DD sein oder als gültiges Excel-Datum.</small></p>
            <div class="import-export-actions">
                <div class="form-group">
                    <label for="fileImport">Datei zum Importieren auswählen</label>
                    <input type="file" id="fileImport" accept=".csv, .xls, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" onChange=${handleCsvImport} />
                </div>
                 <div class="export-buttons-group">
                    <button class="btn btn-secondary" onClick=${handleCsvExport}>Daten exportieren (.csv)</button>
                    <button class="btn btn-secondary" onClick=${handleExcelExport}>Daten exportieren (.xlsx)</button>
                </div>
            </div>
        </div>
        <div class="form-actions">
            <button class="btn btn-primary" onClick=${() => setView('dashboard')}>Fertig</button>
        </div>
      </div>
    `;
};

// --- MAIN APP ---

const App = () => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [customers, setCustomers] = useLocalStorage<Customer[]>('crm_customers', []);
  const [settings, setSettings] = useLocalStorage<CompanySettings>('crm_settings', { companyName: 'Meine Firma', logo: null });
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [isFormDirty, setIsFormDirty] = useState(false);

  const setView = (view: View, options?: { force?: boolean }) => {
    if (!options?.force && currentView === 'customerForm' && isFormDirty) {
      if (window.confirm('Sie haben ungespeicherte Änderungen. Möchten Sie wirklich die Seite verlassen?')) {
        setIsFormDirty(false);
        setCurrentView(view);
      }
    } else {
      setIsFormDirty(false);
      setCurrentView(view);
    }
  };

  const saveCustomer = useCallback((customer: Customer) => {
    setCustomers(prevCustomers => {
        const existing = prevCustomers.find(c => c.id === customer.id);
        if (existing) {
            return prevCustomers.map(c => c.id === customer.id ? customer : c);
        } else {
            return [...prevCustomers, customer];
        }
    });
  }, [setCustomers]);

  const deleteCustomer = useCallback((id: string) => {
    setCustomers(prevCustomers => prevCustomers.filter(c => c.id !== id));
  }, [setCustomers]);

  const renderView = () => {
    switch(currentView) {
      case 'dashboard':
        return html`<${Dashboard} setView=${setView} setEditingCustomerId=${setEditingCustomerId} customers=${customers} saveCustomer=${saveCustomer} />`;
      case 'customerList':
        return html`<${CustomerList} customers=${customers} setView=${setView} setEditingCustomerId=${setEditingCustomerId} deleteCustomer=${deleteCustomer} />`;
      case 'customerForm':
        return html`<${CustomerForm} saveCustomer=${saveCustomer} setView=${setView} editingCustomerId=${editingCustomerId} customers=${customers} deleteCustomer=${deleteCustomer} setIsFormDirty=${setIsFormDirty} />`;
       case 'doings':
        return html`<${Doings} customers=${customers} saveCustomer=${saveCustomer} setView=${setView} setEditingCustomerId=${setEditingCustomerId} />`;
      case 'settings':
        return html`<${Settings} settings=${settings} setSettings=${setSettings} setView=${setView} customers=${customers} setCustomers=${setCustomers} />`;
      default:
        return html`<${Dashboard} setView=${setView} setEditingCustomerId=${setEditingCustomerId} customers=${customers} saveCustomer=${saveCustomer} />`;
    }
  }

  return html`
    <${Header} settings=${settings} setView=${setView} />
    <main>
      ${renderView()}
    </main>
  `;
};

render(html`<${App} />`, document.getElementById('app')!);