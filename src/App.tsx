import React, { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { Skull, Mail, RefreshCcw, DollarSign, Plus, Terminal, Menu, X, CheckCircle2, AlertCircle, CalendarDays, List, ChevronLeft, ChevronRight, Send, Zap } from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { Client } from './types';
import { sendEmail } from './lib/gmail';

interface NotificationData {
  type: 'success' | 'error';
  title: string;
  message: string;
  details?: {
    name: string;
    netflixAccount: string;
    day: number;
    amountUsd: number;
    amountBs: number;
  };
}

export default function App() {
  const [clients, setClients] = useState<Client[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(45);
  const [token, setToken] = useState<string | null>('backend');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newClient, setNewClient] = useState<Partial<Client>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [formAmount, setFormAmount] = useState<string>('');
  const [formCurrency, setFormCurrency] = useState<'USD' | 'VES'>('USD');
  const [chatMessages, setChatMessages] = useState<{role: string, content: string}[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoadingRate, setIsLoadingRate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [customEmailModal, setCustomEmailModal] = useState<{ isOpen: boolean; client: Client | null; subject: string; body: string; isSending: boolean }>({ isOpen: false, client: null, subject: '', body: '', isSending: false });

  const login = useGoogleLogin({
    onSuccess: (codeResponse) => setToken(codeResponse.access_token),
    scope: 'https://www.googleapis.com/auth/gmail.send'
  });

  const fetchBCVRate = async () => {
    setIsLoadingRate(true);
    try {
      const res = await fetch('/api/bcv-rates');
      if (res.ok) {
        const data = await res.json();
        if (data.usd > 0) {
          setExchangeRate(data.usd);
        }
      }
    } catch (e: any) {
      console.warn('Error fetching BCV rate:', e.message || e);
    } finally {
      setIsLoadingRate(false);
    }
  };

  useEffect(() => {
    fetchBCVRate();
    const unsub = onSnapshot(collection(db, 'clients'), (snapshot) => {
      const data: Client[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as Client));
      setClients(data);
    });
    return unsub;
  }, []);

  // Auto-dismiss notification after 6 seconds
  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [notification]);

  const handleAutoSendReminders = async () => {
    if (!token) {
      alert('Debes iniciar sesión con Google para enviar correos.');
      return;
    }
    
    const today = currentDate.getDate();
    const todayString = currentDate.toISOString().split('T')[0];
    const dueClients = clients.filter(c => c.status === 'pending' && c.paymentDay === today && c.lastReminderDate !== todayString && c.email);

    if (dueClients.length === 0) {
      alert('No hay clientes pendientes de cobro para el día de hoy, o ya se les envió un recordatorio.');
      return;
    }

    const confirmed = window.confirm(`¿Estás seguro de que deseas enviar recordatorios automáticamente a ${dueClients.length} cliente(s) que vencen hoy?`);
    if (!confirmed) return;

    let successCount = 0;
    
    for (const client of dueClients) {
      try {
        const bsAmount = (client.paymentAmountUsd * exchangeRate).toFixed(2);
        const htmlBody = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #1e3a8a; border-radius: 12px; overflow: hidden; background-color: #0f172a; color: #f1f5f9;">
            <div style="background-color: #1e40af; padding: 20px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">AVISO DE VENCIMIENTO</h1>
            </div>
            <div style="padding: 30px;">
              <p style="font-size: 16px; color: #f8fafc;">Hola <strong>${client.name}</strong>,</p>
              <p style="font-size: 15px; line-height: 1.6; color: #94a3b8;">
                Esperamos que estés disfrutando de tu servicio. Este es un recordatorio automático sobre el vencimiento de tu suscripción el día de hoy.
              </p>
              <div style="background-color: #020617; border: 1px solid #1e3a8a; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Detalles de la Cuenta</p>
                <p style="margin: 8px 0; font-size: 15px;"><strong>Perfil/Cuenta:</strong> <span style="color: #e2e8f0;">${client.netflixAccount}</span></p>
                <p style="margin: 8px 0; font-size: 15px;"><strong>Fecha de Corte:</strong> <span style="color: #60a5fa; font-weight: bold;">Hoy, Día ${client.paymentDay}</span></p>
                <p style="margin: 8px 0; font-size: 15px;"><strong>Total a Pagar:</strong> <span style="color: #10b981; font-weight: bold;">$${client.paymentAmountUsd.toFixed(2)} USD</span> <span style="color: #64748b; font-size: 13px;">(Bs. ${bsAmount})</span></p>
              </div>
              <p style="font-size: 14px; color: #94a3b8; line-height: 1.5;">
                Para evitar cortes o suspensiones, te invitamos a realizar tu pago a tiempo. Si ya realizaste el pago, por favor envía tu comprobante y omite este mensaje.
              </p>
              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #1e3a8a; text-align: center;">
                <p style="font-size: 12px; color: #64748b; margin: 0;">Gracias por tu preferencia.</p>
              </div>
            </div>
          </div>
        `;
        await sendEmail(token, client.email, 'Recordatorio Automático de Suscripción', htmlBody, true);
        
        // Update lastReminderDate in Firestore
        const ref = doc(db, 'clients', client.id);
        await updateDoc(ref, { lastReminderDate: todayString });
        
        successCount++;
      } catch (error: any) {
        console.warn(`Error enviando auto-recordatorio a ${client.email}:`, error.message || error);
      }
    }

    setNotification({
      type: 'success',
      title: 'Envío Automático Completado',
      message: `Se enviaron exitosamente ${successCount} de ${dueClients.length} recordatorios automáticos.`
    });
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(formAmount);
    if (!formAmount || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const amountUsd = formCurrency === 'USD' ? parsedAmount : parsedAmount / exchangeRate;
    if (!newClient.name || !newClient.netflixAccount || !newClient.paymentDay) return;
    
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'clients'), {
        ...newClient,
        paymentAmountUsd: amountUsd,
        status: 'pending'
      });

      const clientName = newClient.name;
      const netflixAcc = newClient.netflixAccount;
      const day = newClient.paymentDay;
      const bsEquivalent = amountUsd * exchangeRate;

      setShowAddForm(false);
      setNewClient({});
      setFormAmount('');
      
      setNotification({
        type: 'success',
        title: '¡Cliente Registrado con Éxito!',
        message: `Los datos de "${clientName}" han sido guardados correctamente en la base de datos.`,
        details: {
          name: clientName,
          netflixAccount: netflixAcc,
          day: day,
          amountUsd: amountUsd,
          amountBs: bsEquivalent
        }
      });
    } catch (error: any) {
      console.warn('Error al registrar cliente:', error.message || error);
      setNotification({
        type: 'error',
        title: 'Error al Guardar',
        message: 'Ocurrió un inconveniente al guardar los datos del cliente. Por favor, intenta de nuevo.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (client: Client) => {
    const ref = doc(db, 'clients', client.id);
    await updateDoc(ref, {
      status: client.status === 'pending' ? 'paid' : 'pending'
    });
  };

  const handleSendReminder = async (client: Client) => {
    if (!token) {
      alert('Debes iniciar sesión con Google para enviar correos.');
      return;
    }
    if (!client.email) {
      alert('El cliente no tiene correo registrado.');
      return;
    }
    
    const confirmed = window.confirm(`¿Estás seguro de que deseas enviar un recordatorio de pago a ${client.name} (${client.email})?`);
    if (!confirmed) return;

    try {
      const bsAmount = (client.paymentAmountUsd * exchangeRate).toFixed(2);
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #1e3a8a; border-radius: 12px; overflow: hidden; background-color: #0f172a; color: #f1f5f9;">
          <div style="background-color: #1e40af; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">AVISO DE VENCIMIENTO</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #f8fafc;">Hola <strong>${client.name}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #94a3b8;">
              Esperamos que estés disfrutando de tu servicio. Este es un recordatorio automático sobre el próximo vencimiento de tu suscripción.
            </p>
            <div style="background-color: #020617; border: 1px solid #1e3a8a; border-radius: 8px; padding: 20px; margin: 25px 0;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: bold;">Detalles de la Cuenta</p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>Perfil/Cuenta:</strong> <span style="color: #e2e8f0;">${client.netflixAccount}</span></p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>Fecha de Corte:</strong> <span style="color: #60a5fa; font-weight: bold;">Día ${client.paymentDay} del mes</span></p>
              <p style="margin: 8px 0; font-size: 15px;"><strong>Total a Pagar:</strong> <span style="color: #10b981; font-weight: bold;">$${client.paymentAmountUsd.toFixed(2)} USD</span> <span style="color: #64748b; font-size: 13px;">(Bs. ${bsAmount})</span></p>
            </div>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.5;">
              Para evitar cortes o suspensiones, te invitamos a realizar tu pago a tiempo. Si ya realizaste el pago, por favor envía tu comprobante y omite este mensaje.
            </p>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #1e3a8a; text-align: center;">
              <p style="font-size: 12px; color: #64748b; margin: 0;">Gracias por tu preferencia.</p>
            </div>
          </div>
        </div>
      `;
      await sendEmail(token, client.email, 'Recordatorio de Pago de Suscripción', htmlBody, true);
      
      setNotification({
        type: 'success',
        title: 'Correo Enviado',
        message: `El recordatorio de pago fue enviado exitosamente a ${client.email}`
      });
    } catch (error: any) {
      console.warn('Gmail API Error:', error.message || error);
      setNotification({
        type: 'error',
        title: 'Error de Envío',
        message: 'Ocurrió un problema al enviar el correo. Verifica los permisos de Gmail.'
      });
    }
  };

  const handleSendCustomEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const { client, subject, body } = customEmailModal;
    if (!client || !client || !client.email || !subject.trim() || !body.trim()) return;

    setCustomEmailModal(prev => ({ ...prev, isSending: true }));
    try {
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #1e3a8a; border-radius: 12px; overflow: hidden; background-color: #0f172a; color: #f1f5f9;">
          <div style="background-color: #1e40af; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px; font-weight: bold; letter-spacing: 1px;">AVISO IMPORTANTE</h1>
          </div>
          <div style="padding: 30px;">
            <p style="font-size: 16px; color: #f8fafc;">Hola <strong>${client.name}</strong>,</p>
            <div style="font-size: 15px; line-height: 1.6; color: #94a3b8; white-space: pre-wrap; margin-top: 20px;">${body}</div>
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #1e3a8a; text-align: center;">
              <p style="font-size: 12px; color: #64748b; margin: 0;">Gestión de Suscripciones</p>
            </div>
          </div>
        </div>
      `;
      await sendEmail(token, client.email, subject, htmlBody, true);
      
      setNotification({
        type: 'success',
        title: 'Correo Enviado',
        message: `El mensaje personalizado fue enviado exitosamente a ${client.email}`
      });
      setCustomEmailModal({ isOpen: false, client: null, subject: '', body: '', isSending: false });
    } catch (error: any) {
      console.warn('Gmail API Error:', error.message || error);
      setNotification({
        type: 'error',
        title: 'Error de Envío',
        message: 'Ocurrió un problema al enviar el correo personalizado.'
      });
      setCustomEmailModal(prev => ({ ...prev, isSending: false }));
    }
  };

  const openCustomEmailModal = (client: Client) => {
    if (!token) {
      alert('Debes iniciar sesión con Google para enviar correos.');
      return;
    }
    if (!client.email) {
      alert('El cliente no tiene correo registrado.');
      return;
    }
    setCustomEmailModal({ isOpen: true, client, subject: '', body: '', isSending: false });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;
    const newMessages = [...chatMessages, { role: 'user', content: inputMessage }];
    setChatMessages(newMessages);
    setInputMessage('');
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      if (!res.ok) {
        setChatMessages([...newMessages, { role: 'model', content: `Error: ${data.error || 'Ocurrió un problema de comunicación.'}` }]);
        return;
      }
      setChatMessages([...newMessages, { role: 'model', content: data.content }]);
    } catch (e: any) {
      console.warn('Chat API Network Error:', e.message || e);
      setChatMessages([...newMessages, { role: 'model', content: 'Error de red. Verifica tu conexión.' }]);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-[#0A0A0B] text-slate-300 flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-80 bg-[#121214] border-r border-slate-800 flex flex-col p-6 shrink-0 h-full transition-transform duration-300 md:relative md:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Logo */}
        <div className="flex items-center justify-between mb-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded flex items-center justify-center">
              <div className="w-4 h-4 bg-white rounded-sm"></div>
            </div>
            <span className="text-white font-bold text-lg tracking-tight">StreamAdmin</span>
          </div>
          <button className="md:hidden text-slate-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tasa del Dia */}
        <div className="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 mb-6 shrink-0 relative group">
          <div className="flex justify-between items-center mb-1">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Tasa BCV</p>
            <button onClick={fetchBCVRate} disabled={isLoadingRate} className={`text-slate-500 hover:text-emerald-500 transition-colors ${isLoadingRate ? 'animate-spin' : ''}`} title="Actualizar Tasa BCV">
              <RefreshCcw className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-end gap-1">
            <span className="text-xl font-bold text-emerald-500">Bs.</span>
            <input 
              type="number" 
              value={exchangeRate}
              onChange={(e) => setExchangeRate(Number(e.target.value))}
              className="bg-transparent text-xl font-bold text-emerald-500 outline-none w-24"
            />
            <span className="text-xs text-slate-400 font-normal mb-1">/ USD</span>
          </div>
        </div>

        {/* Chat AI */}
        <div className="flex-1 flex flex-col bg-slate-800/20 rounded-xl border border-slate-700/50 overflow-hidden min-h-0">
          <div className="p-3 border-b border-slate-700/50 bg-slate-800/40 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-semibold text-slate-300">Asistente IA</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 ? (
              <p className="text-xs text-slate-500 text-center mt-4">Esperando consultas...</p>
            ) : (
              chatMessages.map((m, i) => (
                <div key={i} className={`p-2 rounded-lg text-xs ${m.role === 'user' ? 'bg-slate-700 text-white ml-4' : 'bg-[#121214] border border-slate-700 text-slate-300 mr-4'}`}>
                  {m.content}
                </div>
              ))
            )}
          </div>
          <div className="p-2 border-t border-slate-700/50 flex gap-2">
            <input 
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && sendMessage()}
              className="flex-1 bg-[#121214] border border-slate-700 rounded p-2 text-xs text-slate-300 outline-none focus:border-emerald-500"
              placeholder="Mensaje..."
            />
            <button onClick={sendMessage} className="p-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white transition-colors">
              <span className="text-xs font-bold">»</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col bg-[#0A0A0B] h-[100dvh] overflow-hidden min-w-0 relative">
        
        {/* Custom Email Modal */}
        {customEmailModal.isOpen && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
            <div className="bg-[#121214] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white">Redactar Mensaje</h3>
                  <p className="text-xs text-slate-500">Para: {customEmailModal.client?.name} ({customEmailModal.client?.email})</p>
                </div>
                <button onClick={() => setCustomEmailModal({ ...customEmailModal, isOpen: false })} className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSendCustomEmail} className="p-6 flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Asunto</label>
                  <input required placeholder="Ej: Información sobre tu plan" value={customEmailModal.subject} onChange={e => setCustomEmailModal({ ...customEmailModal, subject: e.target.value })} className="w-full bg-[#0A0A0B] border border-slate-700 rounded-lg p-3 text-sm text-slate-300 outline-none focus:border-blue-500 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Mensaje</label>
                  <textarea required rows={5} placeholder="Escribe tu mensaje aquí..." value={customEmailModal.body} onChange={e => setCustomEmailModal({ ...customEmailModal, body: e.target.value })} className="w-full bg-[#0A0A0B] border border-slate-700 rounded-lg p-3 text-sm text-slate-300 outline-none focus:border-blue-500 transition-colors resize-none" />
                </div>
                <div className="flex justify-end gap-3 mt-2">
                  <button type="button" onClick={() => setCustomEmailModal({ ...customEmailModal, isOpen: false })} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                  <button type="submit" disabled={customEmailModal.isSending} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                    {customEmailModal.isSending ? (
                      <>
                        <RefreshCcw className="w-4 h-4 animate-spin" />
                        <span>Enviando...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Mensaje</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {notification && (
          <div className="fixed top-5 right-5 left-5 md:left-auto md:w-96 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className={`p-4 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 ${
              notification.type === 'success' 
                ? 'bg-[#121c16]/95 border-emerald-500/40 text-slate-200' 
                : 'bg-[#201314]/95 border-red-500/40 text-slate-200'
            }`}>
              <div className="shrink-0 mt-0.5">
                {notification.type === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className={`text-sm font-semibold ${
                    notification.type === 'success' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {notification.title}
                  </h4>
                  <button 
                    onClick={() => setNotification(null)}
                    className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-300 mt-1">{notification.message}</p>
                {notification.details && (
                  <div className="mt-2.5 pt-2 border-t border-emerald-500/20 grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>
                      <span className="text-slate-500 block">Vencimiento:</span>
                      <span className="font-medium text-slate-200">Día {notification.details.day}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Monto:</span>
                      <span className="font-medium text-emerald-400">${notification.details.amountUsd.toFixed(2)} USD</span>
                      <span className="text-[10px] text-slate-400 block">(Bs. {notification.details.amountBs.toFixed(2)})</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="md:h-20 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between px-4 md:px-8 py-4 gap-4 shrink-0">
          <div className="flex items-center gap-4">
            <button className="md:hidden text-slate-300 hover:text-white" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-lg md:text-xl font-semibold text-white">Gestión de Suscripciones</h1>
              <p className="text-xs text-slate-500">Control de pagos y vencimientos</p>
            </div>
          </div>
          <div className="flex gap-2 sm:gap-3">
            {!token ? (
              <button onClick={() => login()} className="bg-slate-800 hover:bg-slate-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-1 sm:flex-none justify-center">
                <Mail className="w-4 h-4" /> <span className="hidden sm:inline">Conectar Gmail</span>
              </button>
            ) : (
              <>
                <button onClick={handleAutoSendReminders} className="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors flex-1 sm:flex-none justify-center" title="Enviar recordatorios automáticos a clientes vencidos hoy">
                  <Zap className="w-4 h-4" /> <span className="hidden sm:inline">Auto-Enviar</span>
                </button>
                <span className="bg-emerald-900/30 text-emerald-500 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border border-emerald-900/50 flex-1 sm:flex-none justify-center">
                  <Mail className="w-4 h-4" /> <span className="hidden sm:inline">Gmail Conectado</span>
                </span>
              </>
            )}
            <button onClick={() => setShowAddForm(!showAddForm)} className="bg-red-600 hover:bg-red-700 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 flex-1 sm:flex-none justify-center">
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Nueva</span>
            </button>
          </div>
        </header>

        {/* Form Add */}
        {showAddForm && (
          <div className="px-4 md:px-8 pt-4 md:pt-6 shrink-0 overflow-y-auto md:overflow-visible max-h-[50vh] md:max-h-none">
            <form onSubmit={handleAddClient} className="bg-[#121214] border border-slate-800 p-4 md:p-6 rounded-2xl">
              <h3 className="text-sm font-semibold text-white mb-4">Registrar Nueva Suscripción</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4 mb-4">
                <input required placeholder="Cliente" onChange={e => setNewClient({...newClient, name: e.target.value})} className="bg-[#0A0A0B] border border-slate-700 rounded-lg p-2.5 text-sm text-slate-300 outline-none focus:border-red-500" />
                <input required placeholder="Cuenta (Correo Netflix)" onChange={e => setNewClient({...newClient, netflixAccount: e.target.value})} className="bg-[#0A0A0B] border border-slate-700 rounded-lg p-2.5 text-sm text-slate-300 outline-none focus:border-red-500" />
                <input placeholder="Correo Contacto" onChange={e => setNewClient({...newClient, email: e.target.value})} className="bg-[#0A0A0B] border border-slate-700 rounded-lg p-2.5 text-sm text-slate-300 outline-none focus:border-red-500" />
                <div className="flex gap-2">
                  <input required type="number" min="1" max="31" placeholder="Día" onChange={e => setNewClient({...newClient, paymentDay: Number(e.target.value)})} className="w-16 bg-[#0A0A0B] border border-slate-700 rounded-lg p-2.5 text-sm text-slate-300 outline-none focus:border-red-500" />
                  <div className="flex-1 flex bg-[#0A0A0B] border border-slate-700 rounded-lg overflow-hidden focus-within:border-red-500">
                    <select value={formCurrency} onChange={e => setFormCurrency(e.target.value as 'USD'|'VES')} className="bg-slate-800 text-slate-300 px-2 outline-none text-sm border-r border-slate-700 cursor-pointer">
                      <option value="USD">USD$</option>
                      <option value="VES">Bs.</option>
                    </select>
                    <input required type="number" step="0.01" placeholder="Monto" value={formAmount} onChange={e => setFormAmount(e.target.value)} className="w-full bg-transparent p-2.5 text-sm text-slate-300 outline-none" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  {isSubmitting ? (
                    <>
                      <RefreshCcw className="w-4 h-4 animate-spin" />
                      <span>Guardando...</span>
                    </>
                  ) : (
                    <span>Guardar</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Stats */}
        <section className="p-4 md:p-8 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 shrink-0">
          <div className="bg-[#121214] border border-slate-800 p-4 md:p-6 rounded-2xl">
            <p className="text-slate-500 text-sm mb-1">Total Suscripciones</p>
            <p className="text-2xl md:text-3xl font-bold text-white">{clients.length}</p>
          </div>
          <div className="bg-[#121214] border border-slate-800 p-4 md:p-6 rounded-2xl">
            <p className="text-slate-500 text-sm mb-1">Recaudación Estimada</p>
            <p className="text-2xl md:text-3xl font-bold text-white">${clients.reduce((acc, c) => acc + c.paymentAmountUsd, 0).toFixed(2)}</p>
            <p className="text-xs text-emerald-500 mt-1">Bs. {(clients.reduce((acc, c) => acc + c.paymentAmountUsd, 0) * exchangeRate).toFixed(2)}</p>
          </div>
          <div className="bg-[#121214] border border-slate-800 p-4 md:p-6 rounded-2xl">
            <p className="text-slate-500 text-sm mb-1">Pagos Pendientes</p>
            <p className="text-2xl md:text-3xl font-bold text-white">{clients.filter(c => c.status === 'pending').length}</p>
          </div>
        </section>

        {/* Content Area */}
        <section className="px-4 md:px-8 pb-4 md:pb-8 flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex justify-between items-end mb-4 shrink-0">
            <h2 className="text-white font-semibold text-lg hidden sm:block">
              {viewMode === 'list' ? 'Lista de Clientes' : 'Calendario de Vencimientos'}
            </h2>
            <div className="flex bg-[#121214] border border-slate-800 rounded-lg overflow-hidden ml-auto">
              <button onClick={() => setViewMode('list')} className={`px-4 py-2 flex items-center justify-center transition-colors ${viewMode === 'list' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <List className="w-4 h-4" />
              </button>
              <button onClick={() => setViewMode('calendar')} className={`px-4 py-2 flex items-center justify-center transition-colors ${viewMode === 'calendar' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
                <CalendarDays className="w-4 h-4" />
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <div className="bg-[#121214] border border-slate-800 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl">
              <div className="hidden md:grid grid-cols-6 px-6 py-4 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
              <div className="col-span-2">Cliente / Cuenta</div>
              <div>Vencimiento</div>
              <div>Monto (USD/Bs)</div>
              <div>Estado</div>
              <div className="text-right">Acciones</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {clients.map(client => {
                const isPending = client.status === 'pending';
                const bsAmount = (client.paymentAmountUsd * exchangeRate).toFixed(2);
                return (
                  <div key={client.id} className="flex flex-col md:grid md:grid-cols-6 px-4 md:px-6 py-4 border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors gap-3 md:gap-0 md:items-center">
                    
                    {/* Mobile top row: name & status */}
                    <div className="flex justify-between items-start md:col-span-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{client.name}</p>
                        <p className="text-xs text-slate-500">{client.netflixAccount}</p>
                      </div>
                      <div className="md:hidden">
                        {isPending ? (
                          <span className="px-2 py-1 bg-red-900/30 text-red-500 rounded text-[10px] font-bold uppercase border border-red-900/50">Pendiente</span>
                        ) : (
                          <span className="px-2 py-1 bg-emerald-900/30 text-emerald-500 rounded text-[10px] font-bold uppercase border border-emerald-900/50">Pagado</span>
                        )}
                      </div>
                    </div>
                    
                    {/* Due Date & Amount */}
                    <div className="flex justify-between items-center md:contents">
                      <div className={`text-sm font-medium ${isPending ? 'text-red-400' : 'text-slate-400'}`}>
                        <span className="md:hidden text-xs text-slate-500 font-normal mr-1">Vence:</span>
                        Día {client.paymentDay}
                      </div>
                      <div className="text-right md:text-left">
                        <p className="text-sm text-white">${client.paymentAmountUsd.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500">Bs. {bsAmount}</p>
                      </div>
                    </div>

                    {/* Status Desktop */}
                    <div className="hidden md:block">
                      {isPending ? (
                        <span className="px-2 py-1 bg-red-900/30 text-red-500 rounded text-[10px] font-bold uppercase border border-red-900/50">Pendiente</span>
                      ) : (
                        <span className="px-2 py-1 bg-emerald-900/30 text-emerald-500 rounded text-[10px] font-bold uppercase border border-emerald-900/50">Pagado</span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-2 border-t border-slate-800/50 pt-3 mt-1 md:border-t-0 md:pt-0 md:mt-0">
                      <button onClick={() => openCustomEmailModal(client)} className="p-2 bg-slate-800 rounded hover:bg-slate-700 text-blue-400 transition-colors flex-1 md:flex-none justify-center flex items-center" title="Enviar Correo Personalizado">
                        <Send className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleSendReminder(client)} className="p-2 bg-slate-800 rounded hover:bg-slate-700 text-slate-300 transition-colors flex-1 md:flex-none justify-center flex items-center" title="Recordatorio Automático">
                        <Mail className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleToggleStatus(client)} className={`p-2 rounded transition-colors flex-1 md:flex-none justify-center flex items-center ${isPending ? 'bg-emerald-900/20 text-emerald-500 hover:bg-emerald-900/40 border border-emerald-900/30' : 'bg-slate-800 text-slate-500 hover:bg-slate-700 border border-slate-700'}`} title={isPending ? 'Marcar Pagado' : 'Marcar Pendiente'}>
                        <RefreshCcw className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteDoc(doc(db, 'clients', client.id))} className="p-2 bg-red-900/20 text-red-500 rounded hover:bg-red-900/40 border border-red-900/30 transition-colors flex-1 md:flex-none justify-center flex items-center" title="Eliminar">
                        <Skull className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          ) : (
            (() => {
              const currentMonth = currentDate.getMonth();
              const currentYear = currentDate.getFullYear();
              const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
              const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();

              const prevMonth = () => setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
              const nextMonth = () => setCurrentDate(new Date(currentYear, currentMonth + 1, 1));

              const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

              const days = [];
              for (let i = 0; i < firstDayOfMonth; i++) {
                days.push(<div key={`empty-${i}`} className="bg-[#121214]/30 border border-slate-800/50 p-2 opacity-50 rounded-lg"></div>);
              }

              for (let day = 1; day <= daysInMonth; day++) {
                const clientsOnDay = clients.filter(c => c.paymentDay === day);
                const hasPending = clientsOnDay.some(c => c.status === 'pending');
                
                days.push(
                  <div key={`day-${day}`} className="bg-[#121214] border border-slate-800 p-1.5 md:p-2.5 flex flex-col min-h-[70px] md:min-h-[100px] hover:border-slate-600 transition-colors rounded-lg overflow-hidden">
                    <span className={`text-xs md:text-sm font-bold mb-1 ${clientsOnDay.length > 0 ? (hasPending ? 'text-red-400' : 'text-emerald-400') : 'text-slate-600'}`}>{day}</span>
                    <div className="flex-1 flex flex-col gap-1 overflow-y-auto no-scrollbar">
                      {clientsOnDay.map(c => (
                        <div key={c.id} className={`text-[9px] md:text-[10px] truncate px-1 py-0.5 rounded border ${c.status === 'pending' ? 'bg-red-900/20 text-red-400 border-red-900/30' : 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30'}`} title={c.name}>
                          {c.name}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <div className="bg-[#121214] border border-slate-800 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl p-3 md:p-5">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="text-white font-bold text-base md:text-lg capitalize">{monthNames[currentMonth]} {currentYear}</h3>
                    <div className="flex gap-1 md:gap-2">
                      <button onClick={prevMonth} className="p-1.5 md:p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button onClick={() => setCurrentDate(new Date())} className="px-2 md:px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] md:text-xs font-semibold text-white transition-colors">
                        HOY
                      </button>
                      <button onClick={nextMonth} className="p-1.5 md:p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 shrink-0">
                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                      <div key={day} className="text-center text-[9px] md:text-[10px] font-bold uppercase tracking-widest text-slate-500 py-1">{day}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1 md:gap-2 overflow-y-auto flex-1 content-start pr-1 pb-2">
                    {days}
                  </div>
                </div>
              );
            })()
          )}
        </section>

      </main>
      
    </div>
  );
}
