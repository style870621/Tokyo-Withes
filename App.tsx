import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Tab, BookingSubTab, ItineraryItem, FlightBooking, StayBooking, CarBooking, AttractionBooking, ShoppingItem, Expense } from './types';
import { DATE_RANGE, MEMBERS, Icons, FLIGHT_DB, DEFAULT_PACKING } from './constants';
import { magicalCorrectLocation, estimateTransportTime, getApiKeyStatus, testConnection } from './geminiService';
import { pushToRoom, subscribeToRoom } from './firebaseService';

const storage = {
  get: <T,>(key: string, defaultValue: T): T => {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch { return defaultValue; }
  },
  set: (key: string, value: any) => localStorage.setItem(key, JSON.stringify(value))
};

const getTransportLink = (origin: string, destination: string, mode: 'transit' | 'drive' | 'walk') => {
  const travelMode = mode === 'drive' ? 'driving' : mode === 'walk' ? 'walking' : 'transit';
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${travelMode}`;
};

const SimplePieChart: React.FC<{ 
  data: { label: string, value: number, color: string }[], 
  exchangeRate: number 
}> = ({ data, exchangeRate }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return <div className="text-gray-400 text-[10px] italic py-8 text-center">尚無魔法數據</div>;
  let cumulativePercent = 0;
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 32 32" className="w-full h-full -rotate-90 drop-shadow-xl">
          {data.map((item, index) => {
            if (item.value <= 0) return null;
            const percent = (item.value / total) * 100;
            const strokeDasharray = `${percent} ${100 - percent}`;
            const strokeDashoffset = -cumulativePercent;
            cumulativePercent += percent;
            return (
              <circle key={index} r="16" cx="16" cy="16" fill="transparent" stroke={item.color} strokeWidth="32" strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} />
            );
          })}
        </svg>
      </div>
      <div className="w-full space-y-2">
        {data.map((item, index) => item.value > 0 ? (
          <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 rounded-xl">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></div>
            <span className="text-[11px] font-bold text-[#0E1A40] w-12">{item.label}</span>
            <div className="flex-1 text-right">
              <div className="text-[11px] font-bold text-[#0E1A40]">$ {Math.round(item.value * exchangeRate).toLocaleString()}</div>
              <div className="text-[9px] text-gray-400 font-mono">¥ {Math.round(item.value).toLocaleString()}</div>
            </div>
            <div className="text-[10px] font-bold text-[#946A2D] w-10 text-right">
              {Math.round((item.value / total) * 100)}%
            </div>
          </div>
        ) : null)}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('itinerary');
  const [bookingTab, setBookingTab] = useState<BookingSubTab>('flights');
  const [selectedDay, setSelectedDay] = useState(DATE_RANGE[0].date);
  const [currentUser, setCurrentUser] = useState(storage.get('wizard_user', '小語'));

  const [itinerary, setItinerary] = useState<ItineraryItem[]>(storage.get('itinerary_muggle', []));
  const [flights, setFlights] = useState<FlightBooking[]>(storage.get('flights_muggle', []));
  const [stays, setStays] = useState<StayBooking[]>(storage.get('stays_muggle', []));
  const [cars, setCars] = useState<CarBooking[]>(storage.get('cars_muggle', []));
  const [attractions, setAttractions] = useState<AttractionBooking[]>(storage.get('attractions_muggle', []));
  const [shopping, setShopping] = useState<ShoppingItem[]>(storage.get('shopping_muggle', []));
  const [expenses, setExpenses] = useState<Expense[]>(storage.get('expenses_muggle', []));
  const [userPackingLists, setUserPackingLists] = useState<Record<string, string[]>>(storage.get('wizard_packing_lists', {}));
  const [packingChecked, setPackingChecked] = useState<Record<string, string[]>>(storage.get('packing_checked', {}));
  const [exchangeRate, setExchangeRate] = useState(0.215);

  const roomId = 'tokyo-witches';
  const [isLiveSync, setIsLiveSync] = useState(storage.get('magic_live_sync', true));
  const remoteUpdateRef = useRef(false);

  const [jpyInput, setJpyInput] = useState<string>('');
  const [twdInput, setTwdInput] = useState<string>('');
  const [isMagicLoading, setIsMagicLoading] = useState(false);
  const [showModal, setShowModal] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [viewImage, setViewImage] = useState<string | null>(null);
  const [syncString, setSyncString] = useState('');
  const [testResult, setTestResult] = useState<{ ok?: boolean; msg?: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storage.set('itinerary_muggle', itinerary);
    storage.set('flights_muggle', flights);
    storage.set('stays_muggle', stays);
    storage.set('cars_muggle', cars);
    storage.set('attractions_muggle', attractions);
    storage.set('shopping_muggle', shopping);
    storage.set('expenses_muggle', expenses);
    storage.set('wizard_packing_lists', userPackingLists);
    storage.set('packing_checked', packingChecked);
    storage.set('wizard_user', currentUser);
    storage.set('magic_live_sync', isLiveSync);
  }, [itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked, currentUser, isLiveSync]);

  useEffect(() => {
    if (!isLiveSync) return;
    if (remoteUpdateRef.current) {
      remoteUpdateRef.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const allData = { itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked };
      pushToRoom(roomId, allData);
    }, 2000);
    return () => clearTimeout(timer);
  }, [itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked, isLiveSync]);

  useEffect(() => {
    if (!isLiveSync) return;
    const unsubscribe = subscribeToRoom(roomId, (remoteData) => {
      remoteUpdateRef.current = true;
      if (remoteData.itinerary) setItinerary(remoteData.itinerary);
      if (remoteData.flights) setFlights(remoteData.flights);
      if (remoteData.stays) setStays(remoteData.stays);
      if (remoteData.cars) setCars(remoteData.cars);
      if (remoteData.attractions) setAttractions(remoteData.attractions);
      if (remoteData.shopping) setShopping(remoteData.shopping);
      if (remoteData.expenses) setExpenses(remoteData.expenses);
      if (remoteData.userPackingLists) setUserPackingLists(remoteData.userPackingLists);
      if (remoteData.packingChecked) setPackingChecked(remoteData.packingChecked);
    });
    return () => unsubscribe();
  }, [isLiveSync]);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/JPY')
      .then(r => r.json())
      .then((d: any) => { if (d?.rates?.TWD) setExchangeRate(d.rates.TWD); })
      .catch(() => {});
  }, []);

  const sortedItinerary = useMemo(() => itinerary.filter(i => i.day === selectedDay).sort((a, b) => a.time.localeCompare(b.time)), [itinerary, selectedDay]);

  const handleToggleAction = (id: string) => {
    const next = new Set(expandedItems);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedItems(next);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, target: string) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (target === 'attraction_vouchers') {
        setEditData((prev: any) => ({ ...prev, vouchers: [...(prev.vouchers || []), base64] }));
      } else if (target === 'shopping_photo') {
        setEditData((prev: any) => ({ ...prev, photo: base64 }));
      } else if (target === 'expense_receipt') {
        setEditData((prev: any) => ({ ...prev, receiptImage: base64 }));
      } else if (target === 'car_voucher') {
        setEditData((prev: any) => ({ ...prev, voucher: base64 }));
      }
    };
    reader.readAsDataURL(files[0]);
  };

  const getSettlements = () => {
    const balances: Record<string, number> = {};
    MEMBERS.forEach(m => balances[m] = 0);
    expenses.forEach(exp => {
      const rate = exp.currency === 'JPY' ? 1 : 1 / exchangeRate;
      exp.payers.forEach(p => balances[p.name] = (balances[p.name] || 0) + (p.amount * rate));
      exp.splitters.forEach(s => balances[s.name] = (balances[s.name] || 0) - (s.amount * rate));
    });
    const settlements: { from: string; to: string; amount: number }[] = [];
    const debtors = MEMBERS.map(m => ({ name: m, balance: balances[m] })).filter(x => x.balance < -0.1).sort((a, b) => a.balance - b.balance);
    const creditors = MEMBERS.map(m => ({ name: m, balance: balances[m] })).filter(x => x.balance > 0.1).sort((a, b) => b.balance - a.balance);
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      const debtor = debtors[d];
      const creditor = creditors[c];
      const amount = Math.min(-debtor.balance, creditor.balance);
      if (amount > 0.1) settlements.push({ from: debtor.name, to: creditor.name, amount });
      debtor.balance += amount; creditor.balance -= amount;
      if (debtor.balance > -0.1) d++; if (creditor.balance < 0.1) c++;
    }
    return settlements;
  };

 const saveModal = () => {
  if (!editData) return;
 
  // 修正：明確區分是「編輯模式」還是「新增模式」
  const isEditing = editData.id && editData.id !== '';
  const finalId = isEditing ? editData.id : crypto.randomUUID();
  const data = { ...editData, id: finalId };

  if (showModal === 'itinerary') {
    const payload = { ...data, day: selectedDay };
    setItinerary(prev => isEditing ? prev.map(x => x.id === finalId ? payload : x) : [...prev, payload]);
  }
  else if (showModal === 'flight') setFlights(prev => isEditing ? prev.map(x => x.id === finalId ? data : x) : [...prev, data]);
  else if (showModal === 'stay') setStays(prev => isEditing ? prev.map(x => x.id === finalId ? data : x) : [...prev, data]);
  else if (showModal === 'car') setCars(prev => isEditing ? prev.map(x => x.id === finalId ? data : x) : [...prev, data]);
  else if (showModal === 'attraction') setAttractions(prev => isEditing ? prev.map(x => x.id === finalId ? data : x) : [...prev, data]);
  else if (showModal === 'shopping') setShopping(prev => isEditing ? prev.map(x => x.id === finalId ? data : x) : [...prev, data]);
    else if (showModal === 'packing') {
      const list = userPackingLists[currentUser] || DEFAULT_PACKING;
      const newList = editData.isNew ? [...list, editData.name] : list.map((x, i) => i === editData.index ? editData.name : x);
      setUserPackingLists(prev => ({ ...prev, [currentUser]: newList }));
    }
    else if (showModal === 'expense') {
      const payerSum = data.payers.reduce((s: number, p: any) => s + p.amount, 0);
      const splitterSum = data.splitters.reduce((s: number, p: any) => s + p.amount, 0);
      if (Math.abs(payerSum - data.amount) > 1 || Math.abs(splitterSum - data.amount) > 1) {
        alert(`金額校驗不符！\n消費總額：${data.amount}\n付款總額：${payerSum}\n分攤總額：${splitterSum}`);
        return;
      }
      setExpenses(prev => editData.id ? prev.map(x => x.id === id ? data : x) : [...prev, { ...data, createdAt: Date.now() }]);
    }
    setShowModal(null);
  };

  const handleExport = () => {
    const fullData = { itinerary, flights, stays, cars, attractions, shopping, expenses, userPackingLists, packingChecked };
    const str = btoa(unescape(encodeURIComponent(JSON.stringify(fullData))));
    setSyncString(str);
    navigator.clipboard.writeText(str);
    alert('🧙‍♂️ 咒語已複製！請傳給朋友貼上。');
  };

  const handleImport = () => {
    if (!syncString) return;
    try {
      const decoded = JSON.parse(decodeURIComponent(escape(atob(syncString))));
      if (confirm('⚠️ 貼上咒語將會覆蓋你手機目前的全部行程資料，確定要施展嗎？')) {
        if (decoded.itinerary) setItinerary(decoded.itinerary);
        if (decoded.flights) setFlights(decoded.flights);
        if (decoded.stays) setStays(decoded.stays);
        if (decoded.cars) setCars(decoded.cars);
        if (decoded.attractions) setAttractions(decoded.attractions);
        if (decoded.shopping) setShopping(decoded.shopping);
        if (decoded.expenses) setExpenses(decoded.expenses);
        if (decoded.userPackingLists) setUserPackingLists(decoded.userPackingLists);
        if (decoded.packingChecked) setPackingChecked(decoded.packingChecked);
        alert('✨ 魔法同步成功！');
        setSyncString('');
      }
    } catch (e) { alert('❌ 咒語無效，請確認是否複製完整。'); }
  };

  const handleTestMagic = async () => {
    setTestResult({ msg: "正在連線測試..." });
    const res = await testConnection();
    setTestResult(res);
  };

  const renderMultiMember = (selected: string[], onChange: (val: string[]) => void) => (
    <div className="flex flex-wrap gap-2 mb-4">
      {MEMBERS.map(m => (
        <button key={m} onClick={() => onChange(selected.includes(m) ? selected.filter(x => x !== m) : [...selected, m])} className={`px-4 py-2 rounded-xl text-[10px] font-bold border transition-all ${selected.includes(m) ? 'bg-[#0E1A40] text-white border-transparent shadow-md' : 'bg-white text-gray-400 border-gray-100'}`}>{m}</button>
      ))}
    </div>
  );

  return (
    <div className="max-w-[480px] mx-auto min-h-screen bg-[#f5f5f5] flex flex-col relative shadow-2xl overflow-hidden pb-32">
      <header className="sticky top-0 z-40 glass border-b border-[#946A2D]/30 px-6 py-6 text-left flex justify-between items-end">
        <div><h1 className="serif text-2xl font-bold tracking-tight text-[#0E1A40]">東京小怪獸富士山巫師之旅</h1><p className="text-[9px] uppercase tracking-[0.3em] text-[#946A2D] font-bold mt-1">2026.01.29 - 02.02</p></div>
        <div className="text-right"><span className="text-[10px] font-bold bg-[#0E1A40] text-white px-3 py-1.5 rounded-full shadow-lg border border-[#946A2D]/40">{currentUser}</span></div>
      </header>

      <main className="flex-1 px-6 pt-2">
        {activeTab === 'itinerary' && (
          <div className="animate-fade-in space-y-6 mt-4">
            <div className="flex gap-2 overflow-x-auto pb-4">
              {DATE_RANGE.map((d, idx) => (
                <button key={d.date} onClick={() => setSelectedDay(d.date)} className={`flex-shrink-0 w-20 py-4 rounded-3xl flex flex-col items-center border transition-all ${selectedDay === d.date ? 'bg-[#0E1A40] text-white border-transparent shadow-xl' : 'bg-white text-gray-400 border-gray-100'}`}><span className="text-[10px] font-bold opacity-60 mb-1">{d.date.slice(5)}</span><span className="text-xl font-bold serif">{idx + 1}</span><span className="text-[9px] font-bold mt-1">週{d.dayOfWeek}</span></button>
              ))}
            </div>
            <div className="flex justify-between items-center px-1"><h2 className="serif text-xl font-bold border-l-4 border-[#0E1A40] pl-3">每日行程</h2><button onClick={() => { setEditData({ time: '09:00', stayDuration: '01:00', displayName: '', actualLocation: '', note: '', transportToNext: { mode: 'transit', duration: '' } }); setShowModal('itinerary'); }} className="text-[11px] font-bold bg-[#0E1A40] text-white px-4 py-2 rounded-full shadow-lg border border-[#946A2D]/30">＋ 新增行程</button></div>
            <div className="space-y-4">
              {sortedItinerary.map((item, idx) => (
                <div key={item.id} className="relative">
                  {idx > 0 && (
                    <div className="ml-12 my-2 p-3 bg-white/50 rounded-2xl border border-dashed border-gray-200 flex items-center justify-between gap-3 text-[10px] font-bold text-gray-400">
                      <div className="flex items-center gap-2">
                        <select value={item.transportToNext?.mode || 'transit'} onChange={(e) => {
                            const mode = e.target.value as any;
                            setItinerary(prev => prev.map(it => it.id === item.id ? { ...it, transportToNext: { ...it.transportToNext!, mode } } : it));
                          }} className="bg-transparent border-none outline-none text-[#946A2D] font-bold">
                          <option value="transit">🚇 大眾</option>
                          <option value="drive">🚗 駕車</option>
                          <option value="walk">🚶 步行</option>
                        </select>
                        <input type="text" value={item.transportToNext?.duration || ''} placeholder="時長" onChange={(e) => setItinerary(prev => prev.map(it => it.id === item.id ? { ...it, transportToNext: { ...it.transportToNext!, duration: e.target.value } } : it))} className="w-16 bg-transparent outline-none border-b border-gray-200 px-1 text-center" />
                        <button onClick={async () => {
                          const prev = sortedItinerary[idx - 1];
                          setIsMagicLoading(true);
                          const time = await estimateTransportTime(prev.actualLocation, item.actualLocation, item.transportToNext?.mode || 'transit');
                          setItinerary(p => p.map(x => x.id === item.id ? { ...x, transportToNext: { ...x.transportToNext!, duration: time } } : x));
                          setIsMagicLoading(false);
                        }} className="text-[#946A2D]"><Icons.Magic /></button>
                      </div>
                      <a href={getTransportLink(sortedItinerary[idx - 1].actualLocation, item.actualLocation, item.transportToNext?.mode || 'transit')} target="_blank" className="p-1.5 bg-[#0E1A40] text-white rounded-lg shadow-sm">
                        <Icons.ExternalLink />
                      </a>
                    </div>
                  )}
                  <div className="pl-12 border-l-2 border-dashed border-[#946A2D]/30 pb-4 group" onClick={() => handleToggleAction(item.id)}>
                    <div className="absolute left-[-16px] top-2 w-8 h-8 bg-[#0E1A40] rounded-full flex items-center justify-center text-white text-[10px] font-bold serif border-4 border-white">{(idx + 1).toString().padStart(2, '0')}</div>
                    <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 mb-2"><span>{item.time} (停留 {item.stayDuration})</span>{expandedItems.has(item.id) && <div className="flex gap-2 animate-fade-in"><button onClick={(e) => { e.stopPropagation(); setEditData(item); setShowModal('itinerary'); }} className="text-[#0E1A40]"><Icons.Pencil /></button><button onClick={(e) => { e.stopPropagation(); setItinerary(itinerary.filter(i => i.id !== item.id)); }} className="text-[#ee463a]"><Icons.Trash /></button></div>}</div>
                    <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md cursor-pointer">
                        <h3 className="font-bold serif text-[#0E1A40] text-lg flex items-center justify-between">{item.displayName}<a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.mapQuery || item.actualLocation)}`} target="_blank" className="text-[#946A2D]"><Icons.Map /></a></h3>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono uppercase">{item.actualLocation}</p>
                        {expandedItems.has(item.id) && item.note && <div className="mt-3 p-3 bg-[#f9fafb] rounded-xl text-[10px] text-gray-600 border-l-4 border-[#946A2D] animate-fade-in whitespace-pre-wrap">{item.note}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'booking' && (
          <div className="animate-fade-in space-y-6 mt-4">
            <div className="flex gap-2 overflow-x-auto pb-2 border-b border-gray-200">
              {(['flights', 'stays', 'cars', 'attractions', 'packing', 'shopping'] as BookingSubTab[]).map(t => (
                <button key={t} onClick={() => setBookingTab(t)} className={`flex-shrink-0 px-4 py-2 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all ${bookingTab === t ? 'bg-[#0E1A40] text-white shadow-md' : 'text-[#0E1A40]'}`}>{t === 'flights' ? '航班' : t === 'stays' ? '住宿' : t === 'cars' ? '租車' : t === 'attractions' ? '景點' : t === 'packing' ? '行李' : '購物'}</button>
              ))}
            </div>

            <div className="flex justify-between items-center">
               <button onClick={() => {
                 let init: any = { id: '', persons: [currentUser] };
                 if (bookingTab === 'flights') { init = { ...init, flightNo: '' }; setShowModal('flight'); }
                 else if (bookingTab === 'stays') { init = { ...init, hotelName: '', checkIn: DATE_RANGE[0].date, checkOut: DATE_RANGE[1].date, checkInTime: '15:00', checkOutTime: '11:00', address: '', note: '' }; setShowModal('stay'); }
                 else if (bookingTab === 'cars') { init = { ...init, company: '', pickupDate: DATE_RANGE[0].date, returnDate: DATE_RANGE[1].date, pickupTime: '10:00', returnTime: '10:00', address: '', note: '', voucher: undefined }; setShowModal('car'); }
                 else if (bookingTab === 'attractions') { init = { ...init, name: '', date: DATE_RANGE[0].date, time: '10:00', address: '', vouchers: [], note: '', persons: [currentUser] }; setShowModal('attraction'); }
                 else if (bookingTab === 'shopping') { init = { ...init, name: '', done: false, photo: undefined, persons: [currentUser] }; setShowModal('shopping'); }
                 else if (bookingTab === 'packing') { init = { name: '', isNew: true }; setShowModal('packing'); }
                 setEditData(init);
               }} className="w-full py-4 border-2 border-dashed border-[#946A2D]/30 rounded-3xl text-[#0E1A40] font-bold text-[10px] uppercase">{bookingTab === 'shopping' ? '＋ 我要買買買' : bookingTab === 'packing' ? '＋ 新增準備項目' : `＋ 新增 ${bookingTab === 'flights' ? '航班' : bookingTab === 'stays' ? '住宿' : bookingTab === 'cars' ? '租車' : '景點'}`}</button>
            </div>

            <div className="space-y-4">
              {bookingTab === 'flights' && flights.map(f => (
                <div key={f.id} className="bg-[#0E1A40] rounded-[2rem] p-6 text-white border border-[#946A2D]/40 shadow-xl relative group" onClick={() => handleToggleAction(f.id)}>
                   <div className="flex gap-1 mb-4 flex-wrap border-b border-white/10 pb-2">{f.persons.map(p => <span key={p} className="text-[8px] bg-[#946A2D] px-2 py-1 rounded-full">{p}</span>)}</div>
                   <div className="flex justify-between items-center text-3xl font-bold serif mb-2"><span>{f.depCity}</span><Icons.Plane /><span className="text-[#946A2D]">{f.arrCity}</span></div>
                   <div className="flex justify-between text-[10px] font-mono opacity-60"><span>{f.depTime} T{f.depTerminal}</span><span className="text-[#946A2D] font-bold">{f.airline} {f.flightNo}</span><span>{f.arrTime} T{f.arrTerminal}</span></div>
                   {expandedItems.has(f.id) && <div className="absolute inset-0 bg-black/80 rounded-[2rem] flex items-center justify-center gap-8 animate-fade-in"><button onClick={(e) => { e.stopPropagation(); setEditData(f); setShowModal('flight'); }} className="text-[#946A2D] scale-150"><Icons.Pencil /></button><button onClick={(e) => { e.stopPropagation(); setFlights(flights.filter(x => x.id !== f.id)); }} className="text-[#ee463a] scale-150"><Icons.Trash /></button></div>}
                </div>
              ))}
              {bookingTab === 'stays' && stays.map(s => (
                <div key={s.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative group overflow-hidden" onClick={() => handleToggleAction(s.id)}>
                   <div className="flex gap-1 mb-2">{s.persons.map(p => <span key={p} className="text-[7px] bg-[#0E1A40] text-white px-2 py-0.5 rounded-full">{p}</span>)}</div>
                   <h4 className="font-bold text-[#0E1A40] text-lg serif">{s.hotelName}</h4><p className="text-[10px] text-gray-400 truncate">{s.address}</p>
                   <div className="mt-4 flex justify-between items-center text-[9px] font-bold text-[#946A2D] uppercase tracking-widest"><span>入住: {s.checkIn} {s.checkInTime}</span><span>退房: {s.checkOut} {s.checkOutTime}</span></div>
                   {expandedItems.has(s.id) && <div className="absolute inset-0 bg-white/90 rounded-3xl flex items-center justify-center gap-8 animate-fade-in"><button onClick={(e) => { e.stopPropagation(); setEditData(s); setShowModal('stay'); }} className="text-[#0E1A40] scale-150"><Icons.Pencil /></button><button onClick={(e) => { e.stopPropagation(); setStays(stays.filter(x => x.id !== s.id)); }} className="text-[#ee463a] scale-150"><Icons.Trash /></button></div>}
                </div>
              ))}
              {bookingTab === 'shopping' && shopping.map(s => (
                <div key={s.id} className={`p-5 rounded-3xl border flex items-center gap-4 group relative ${s.done ? 'bg-gray-100 border-gray-200 opacity-60' : 'bg-white border-gray-100 shadow-sm'}`} onClick={() => handleToggleAction(s.id)}>
                   {s.photo && <img src={s.photo} className="w-14 h-14 rounded-2xl object-cover border border-gray-100" />}
                   <div className="flex-1">
                     <h4 className={`font-bold text-sm ${s.done ? 'line-through text-gray-400' : 'text-[#0E1A40]'}`}>{s.name}</h4>
                     <div className="flex gap-1 mt-1">{s.persons.map(p => <span key={p} className="text-[7px] font-bold opacity-40 uppercase">{p}</span>)}</div>
                   </div>
                   <button onClick={(e) => { e.stopPropagation(); setShopping(prev => prev.map(x => x.id === s.id ? { ...x, done: !x.done } : x)); }} className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all ${s.done ? 'bg-white text-[#946A2D]' : 'bg-[#0E1A40] text-white shadow-md'}`}>{s.done ? 'UNDO' : 'DONE'}</button>
                   {expandedItems.has(s.id) && <div className="absolute inset-0 bg-white/80 rounded-3xl flex items-center justify-center gap-8 animate-fade-in"><button onClick={(e) => { e.stopPropagation(); setEditData(s); setShowModal('shopping'); }} className="text-[#0E1A40] scale-125"><Icons.Pencil /></button><button onClick={(e) => { e.stopPropagation(); setShopping(shopping.filter(x => x.id !== s.id)); }} className="text-[#ee463a] scale-125"><Icons.Trash /></button></div>}
                </div>
              ))}
              {bookingTab === 'packing' && (
                <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
                  <div className="space-y-2">
                    {(userPackingLists[currentUser] || DEFAULT_PACKING).map((item, idx) => {
                      const checked = (packingChecked[currentUser] || []).includes(item);
                      const itemId = `packing-${currentUser}-${idx}`;
                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 bg-[#f5f5f5] rounded-2xl group relative" onClick={() => handleToggleAction(itemId)}>
                          <button onClick={(e) => {
                            e.stopPropagation();
                            const current = packingChecked[currentUser] || [];
                            setPackingChecked(prev => ({ ...prev, [currentUser]: checked ? current.filter(x => x !== item) : [...current, item] }));
                          }} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${checked ? 'bg-[#0E1A40] border-[#0E1A40]' : 'border-gray-200'}`}>{checked && <div className="w-2 h-2 bg-white rounded-full" />}</button>
                          <span className={`text-xs font-bold flex-1 transition-all ${checked ? 'line-through text-gray-300' : 'text-[#0E1A40]'}`}>{item}</span>
                          {expandedItems.has(itemId) && (
                            <div className="flex gap-2 animate-fade-in">
                              <button onClick={(e) => { e.stopPropagation(); setEditData({ name: item, index: idx, isNew: false }); setShowModal('packing'); }} className="text-[#0E1A40]"><Icons.Pencil /></button>
                              <button onClick={(e) => { e.stopPropagation(); setUserPackingLists(prev => ({ ...prev, [currentUser]: (prev[currentUser] || DEFAULT_PACKING).filter((_, i) => i !== idx) })); }} className="text-[#ee463a]"><Icons.Trash /></button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'split' && (
          <div className="animate-fade-in space-y-6 mt-4">
            <button onClick={() => setShowModal('stats')} className="w-full bg-[#0E1A40] rounded-[2.5rem] p-8 text-white shadow-2xl relative border border-[#946A2D]/30 text-left overflow-hidden">
              <div className="absolute top-0 right-0 p-4 text-[#946A2D]/10 scale-[4] rotate-12"><Icons.Wallet /></div>
              <p className="text-[10px] uppercase opacity-60 font-bold mb-4 tracking-widest">魔法收支儀表板 (匯率: {exchangeRate})</p>
              <div className="grid grid-cols-2 gap-4 relative z-10">
                <div className="flex flex-col">
                  <span className="text-[9px] opacity-70 font-bold">總支出 (TWD)</span>
                  <h2 className="serif text-2xl font-bold text-gray-300">$ {Math.round(expenses.reduce((s,e)=>s+(e.currency==='JPY'?e.amount*exchangeRate:e.amount),0)).toLocaleString()}</h2>
                  <span className="text-[9px] opacity-50 mt-1">¥ {Math.round(expenses.reduce((s,e)=>s+(e.currency==='JPY'?e.amount:e.amount/exchangeRate),0)).toLocaleString()}</span>
                </div>
                <div className="flex flex-col text-right">
                  <span className="text-[9px] opacity-70 font-bold">匯率魔法</span>
                  <h2 className="serif text-2xl font-bold text-[#946A2D]">{exchangeRate}</h2>
                  <span className="text-[9px] opacity-50 mt-1">JPY ➜ TWD</span>
                </div>
              </div>
            </button>
            <button onClick={() => { setEditData({ amount: 0, currency: 'JPY', content: '', category: '食', payers: [{name: currentUser, amount: 0}], splitters: MEMBERS.map(m => ({name: m, amount: 0})), paymentMethod: '現金', date: new Date().toISOString().split('T')[0] }); setShowModal('expense'); }} className="w-full bg-[#0E1A40] text-white py-5 rounded-3xl font-bold text-xs shadow-lg uppercase border border-[#946A2D]/50 transition-all active:scale-95">＋ 紀錄魔法支出</button>
            <div className="space-y-4">
              {expenses.sort((a,b)=>b.createdAt-a.createdAt).map(exp => (
                <div key={exp.id} className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm flex justify-between items-center group relative overflow-hidden" onClick={() => handleToggleAction(exp.id)}>
                   <div className="flex gap-4 items-center">
                    <div className="w-10 h-10 bg-[#f5f5f5] rounded-2xl flex items-center justify-center text-[#0E1A40] font-bold text-xs border border-gray-100">{exp.category}</div>
                    <div><h4 className="font-bold text-[#0E1A40] text-sm serif">{exp.content}</h4><p className="text-[9px] text-gray-400 font-bold uppercase mt-1">{exp.paymentMethod} • {exp.date}</p></div>
                  </div>
                  <div className="text-right group-hover:opacity-0 transition-opacity">
                    <p className="font-bold serif text-[#0E1A40] text-lg">$ {Math.round(exp.currency === 'JPY' ? exp.amount * exchangeRate : exp.amount).toLocaleString()}</p>
                    <p className="text-[9px] text-gray-400 font-mono">¥ {Math.round(exp.currency === 'JPY' ? exp.amount : exp.amount / exchangeRate).toLocaleString()}</p>
                  </div>
                  {expandedItems.has(exp.id) && <div className="absolute inset-y-0 right-0 w-32 bg-[#0E1A40]/95 flex items-center justify-center gap-4 translate-x-full group-hover:translate-x-0 transition-transform duration-300"><button onClick={(e) => { e.stopPropagation(); setEditData(exp); setShowModal('expense'); }} className="text-[#946A2D]"><Icons.Pencil /></button><button onClick={(e) => { e.stopPropagation(); setExpenses(expenses.filter(x => x.id !== exp.id)); }} className="text-white"><Icons.Trash /></button></div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="animate-fade-in space-y-8 mt-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
              <h3 className="serif text-xl font-bold mb-6 text-[#0E1A40] flex items-center gap-2"><Icons.Wallet /> 匯率魔法</h3>
              <div className="space-y-4">
                <div className="relative">
                  <input type="number" value={jpyInput} placeholder="日幣 JPY" onChange={(e) => { setJpyInput(e.target.value); setTwdInput(e.target.value ? (Number(e.target.value) * exchangeRate).toFixed(0) : ''); }} className="w-full bg-[#f5f5f5] p-5 rounded-2xl font-bold text-xl border-none outline-none focus:ring-2 ring-[#0E1A40]/10" />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">¥ JPY</span>
                </div>
                <div className="relative">
                  <input type="number" value={twdInput} placeholder="台幣 TWD" onChange={(e) => { setTwdInput(e.target.value); setJpyInput(e.target.value ? (Number(e.target.value) / exchangeRate).toFixed(0) : ''); }} className="w-full bg-[#f5f5f5] p-5 rounded-2xl font-bold text-xl border-none outline-none focus:ring-2 ring-[#0E1A40]/10" />
                  <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400">$ TWD</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
               <a href="https://translate.google.com" target="_blank" className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between group">
                  <div className="flex items-center gap-4"><div className="w-12 h-12 bg-[#0E1A40] text-[#946A2D] rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110"><Icons.Translate /></div><div><h4 className="font-bold text-[#0E1A40]">Google 翻譯</h4><p className="text-[10px] text-gray-400 mt-1 font-bold">開啟即時翻譯魔法</p></div></div><Icons.ExternalLink />
               </a>
               <a href="https://services.digital.go.jp/zh-cmn-hant/visit-japan-web/" target="_blank" className="bg-[#0E1A40] p-6 rounded-3xl text-white shadow-xl flex items-center justify-between border border-[#946A2D]/40 group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 text-[#946A2D]/10 scale-[4]"><Icons.Magic /></div>
                  <div className="relative z-10"><h4 className="font-bold serif text-lg text-[#946A2D]">Visit Japan Web</h4><p className="text-[10px] opacity-70 mt-1 font-bold">⚠️ 入境前 6 小時必須完成申辦</p></div><Icons.ExternalLink />
               </a>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="mt-6 animate-fade-in space-y-6">
            <div className="text-center"><div className="w-28 h-28 bg-[#946A2D]/20 rounded-full mx-auto flex items-center justify-center text-[#0E1A40] mb-4 border-8 border-white shadow-2xl"><Icons.User /></div><h2 className="serif text-3xl font-bold text-[#0E1A40]">{currentUser}</h2></div>
            <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm space-y-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">切換巫師身份</label>
              <div className="grid grid-cols-2 gap-3">{MEMBERS.map(m => (<button key={m} onClick={() => setCurrentUser(m)} className={`py-4 rounded-2xl font-bold text-sm transition-all ${currentUser === m ? 'bg-[#0E1A40] text-white shadow-xl border border-[#946A2D]' : 'bg-[#f5f5f5] text-[#0E1A40]'}`}>{m}</button>))}</div>
            </div>
            <div className="bg-[#0E1A40] rounded-[2.5rem] p-6 border border-[#946A2D]/30 shadow-xl space-y-4">
              <label className="text-[10px] font-bold text-[#946A2D] uppercase tracking-widest px-2 flex items-center gap-2"><Icons.Magic /> 團隊同步魔法 (Live Sync)</label>
              <div className="bg-white/5 p-4 rounded-2xl flex items-center justify-between border border-white/10">
                <div>
                   <p className="text-[11px] text-white font-bold">魔法頻道：<span className="text-[#946A2D]">{roomId}</span></p>
                   <p className="text-[8px] text-white/40 mt-1 uppercase">自動同步模式已啟動</p>
                </div>
                <button onClick={() => setIsLiveSync(!isLiveSync)} className={`px-4 py-2 rounded-full text-[9px] font-bold shadow-lg transition-all active:scale-95 ${isLiveSync ? 'bg-[#946A2D] text-[#0E1A40]' : 'bg-gray-700 text-gray-300'}`}>
                  {isLiveSync ? '⚡️ 同步中' : '❌ 離線'}
                </button>
              </div>
              <p className="text-[9px] text-white/50 px-2 italic leading-relaxed">* 這是專屬於你們的私密頻道。只要所有人都打開同步開關，行程、支出與行李狀態將會全自動跨裝置更新。</p>
            </div>
            <div className="bg-white rounded-[2.5rem] p-6 border-l-8 border-[#0E1A40] shadow-sm space-y-4">
              <label className="text-[10px] font-bold text-[#0E1A40] uppercase tracking-widest px-2 flex items-center gap-2">🔮 魔法金鑰診斷</label>
              {(() => {
                const status = getApiKeyStatus();
                return (
                  <div className="bg-[#f5f5f5] p-4 rounded-2xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500">金鑰狀態:</span>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${status.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{status.msg}</span>
                    </div>
                    <div className="pt-2">
                      <button onClick={handleTestMagic} className="w-full bg-[#0E1A40] text-white py-3 rounded-xl text-[10px] font-bold shadow-md active:scale-95 transition-all">🪄 測試連線 (最準確)</button>
                      {testResult.msg && (
                        <div className={`mt-2 p-3 rounded-xl text-[9px] font-bold leading-relaxed border ${testResult.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                          {testResult.msg}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="bg-white rounded-[2.5rem] p-6 border border-gray-100 shadow-sm space-y-4">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 flex items-center gap-2">📦 備份咒語 (手動備份用)</label>
              <div className="flex flex-col gap-3">
                <button onClick={handleExport} className="w-full bg-[#f5f5f5] text-[#0E1A40] py-4 rounded-2xl font-bold text-xs border border-gray-200 shadow-sm transition-all active:scale-95">🪄 產生並複製咒語</button>
                <div className="relative">
                  <textarea value={syncString} onChange={(e) => setSyncString(e.target.value)} placeholder="在此貼上咒語..." className="w-full h-24 bg-gray-50 border border-gray-100 rounded-2xl p-4 text-[10px] font-mono outline-none" />
                  <button onClick={handleImport} className="absolute bottom-2 right-2 bg-[#0E1A40] text-white px-4 py-2 rounded-xl font-bold text-[10px] shadow-md transition-all active:scale-90">匯入</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="fixed bottom-6 left-4 right-4 max-w-[448px] mx-auto glass rounded-[2.5rem] border border-[#946A2D]/40 py-4 px-6 shadow-2xl z-50 flex justify-between items-center">
        {(['itinerary', 'booking', 'split', 'tools', 'settings'] as Tab[]).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex flex-col items-center gap-1 w-1/5 transition-all ${activeTab === tab ? 'text-[#0E1A40] scale-110' : 'text-[#946A2D]'}`}>
            {tab === 'itinerary' ? <Icons.Map /> : tab === 'booking' ? <Icons.Ticket /> : tab === 'split' ? <Icons.Wallet /> : tab === 'tools' ? <Icons.Wrench /> : <Icons.User />}
            <span className="text-[8px] font-bold uppercase">{tab === 'itinerary' ? '行程' : tab === 'booking' ? '預訂' : tab === 'split' ? '分帳' : tab === 'tools' ? '工具' : '設定'}</span>
          </button>
        ))}
      </nav>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center px-4 pb-10">
          <div className="absolute inset-0 bg-[#0E1A40]/40 backdrop-blur-md" onClick={() => setShowModal(null)}></div>
          <div className="bg-white w-full max-w-md rounded-[3rem] p-8 z-10 shadow-2xl animate-fade-in overflow-y-auto max-h-[90vh] border-t-[10px] border-[#0E1A40]">
            <h3 className="serif text-xl font-bold mb-6 text-center text-[#0E1A40] uppercase tracking-widest">
              {showModal === 'itinerary' ? '加入魔法旅途' :
                showModal === 'flight' ? '＋ 新增航班' :
                showModal === 'stay' ? '＋ 新增住宿' :
                showModal === 'car' ? '＋ 新增租車' :
                showModal === 'attraction' ? '＋ 新增景點' :
                showModal === 'shopping' ? '＋ 我要買買買' : 
                showModal === 'packing' ? '魔法行囊清單' :
                showModal === 'stats' ? '魔法開支統計' : '魔法契約編輯'}
            </h3>
            <div className="space-y-4">
              {showModal === 'itinerary' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-bold text-gray-400 mb-1 block">開始時間</label><input type="time" value={editData.time} onChange={e => setEditData({ ...editData, time: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" /></div>
                    <div><label className="text-[10px] font-bold text-gray-400 mb-1 block">停留時間 (HH:MM)</label><input type="text" placeholder="01:30" value={editData.stayDuration} onChange={e => setEditData({ ...editData, stayDuration: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" /></div>
                  </div>
                  <input type="text" placeholder="景點名稱" value={editData.displayName} onChange={e => setEditData({ ...editData, displayName: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                  <div className="relative group">
                    <input type="text" placeholder="詳細地點或地址" value={editData.actualLocation} onChange={e => setEditData({ ...editData, actualLocation: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold pr-32" />
                    <button onClick={async () => {
                      if (!editData.actualLocation) return;
                      setIsMagicLoading(true);
                      const res = await magicalCorrectLocation(editData.actualLocation);
                      setEditData({ ...editData, actualLocation: res, mapQuery: res });
                      setIsMagicLoading(false);
                    }} className="absolute right-2 top-2 bottom-2 bg-[#0E1A40] text-white px-3 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                      <Icons.Magic /><span className="text-[9px] font-bold">魔法校正</span>
                    </button>
                  </div>
                  <textarea placeholder="魔法筆記 (文字備註欄)" value={editData.note} onChange={e => setEditData({ ...editData, note: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold h-24 border-none outline-none focus:ring-2 ring-[#0E1A40]/10" />
                </>
              )}
              {showModal === 'flight' && (
                <>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">搭乘巫師</p>
                  {renderMultiMember(editData.persons || [], (v) => setEditData({ ...editData, persons: v }))}
                  <input type="text" placeholder="航班號碼 (如: GK12)" value={editData.flightNo} onChange={e => {
                    const v = e.target.value.toUpperCase();
                    const info = FLIGHT_DB[v];
                    if (info) setEditData({ ...editData, ...info, flightNo: v });
                    else setEditData({ ...editData, flightNo: v });
                  }} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                </>
              )}
              {showModal === 'stay' && (
                <>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">入住巫師</p>
                  {renderMultiMember(editData.persons || [], (v) => setEditData({ ...editData, persons: v }))}
                  <input type="text" placeholder="飯店名稱" value={editData.hotelName} onChange={e => setEditData({ ...editData, hotelName: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-bold mb-1 block">入住日期</label><input type="date" value={editData.checkIn} onChange={e => setEditData({ ...editData, checkIn: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold text-xs" /></div>
                    <div><label className="text-[10px] font-bold mb-1 block">退房日期</label><input type="date" value={editData.checkOut} onChange={e => setEditData({ ...editData, checkOut: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold text-xs" /></div>
                  </div>
                  <div className="relative">
                    <input type="text" placeholder="飯店地址" value={editData.address} onChange={e => setEditData({ ...editData, address: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold pr-32" />
                    <button onClick={async () => {
                      if (!editData.address) return;
                      setIsMagicLoading(true);
                      const res = await magicalCorrectLocation(editData.address);
                      setEditData({ ...editData, address: res, mapQuery: res });
                      setIsMagicLoading(false);
                    }} className="absolute right-2 top-2 bottom-2 bg-[#0E1A40] text-white px-3 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                      <Icons.Magic /><span className="text-[9px] font-bold">魔法校正</span>
                    </button>
                  </div>
                  <textarea placeholder="飯店備註" value={editData.note} onChange={e => setEditData({ ...editData, note: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold h-20" />
                </>
              )}
              {showModal === 'car' && (
                <>
                  <input type="text" placeholder="租車公司" value={editData.company} onChange={e => setEditData({ ...editData, company: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-[10px] font-bold mb-1 block">取車日期</label><input type="date" value={editData.pickupDate} onChange={e => setEditData({ ...editData, pickupDate: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold text-xs" /></div>
                    <div><label className="text-[10px] font-bold mb-1 block">還車日期</label><input type="date" value={editData.returnDate} onChange={e => setEditData({ ...editData, returnDate: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold text-xs" /></div>
                  </div>
                  <div className="relative">
                    <input type="text" placeholder="取車地址" value={editData.address} onChange={e => setEditData({ ...editData, address: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold pr-32" />
                    <button onClick={async () => {
                      if (!editData.address) return;
                      setIsMagicLoading(true);
                      const res = await magicalCorrectLocation(editData.address);
                      setEditData({ ...editData, address: res, mapQuery: res });
                      setIsMagicLoading(false);
                    }} className="absolute right-2 top-2 bottom-2 bg-[#0E1A40] text-white px-3 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                      <Icons.Magic /><span className="text-[9px] font-bold">魔法校正</span>
                    </button>
                  </div>
                  <div className="flex gap-4 items-center">
                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white border-2 border-dashed border-gray-200 p-4 rounded-2xl flex flex-col items-center gap-2 text-gray-400">
                      {editData.voucher ? <img src={editData.voucher} className="w-full h-12 object-cover rounded-lg" /> : <span className="text-[10px] font-bold">上傳租車憑證</span>}
                    </button>
                    <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'car_voucher')} />
                  </div>
                </>
              )}
              {showModal === 'attraction' && (
                <>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">參與巫師</p>
                  {renderMultiMember(editData.persons || [], (v) => setEditData({ ...editData, persons: v }))}
                  <input type="text" placeholder="景點名稱" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                  <div className="relative">
                    <input type="text" placeholder="景點地點/地址" value={editData.address} onChange={e => setEditData({ ...editData, address: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold pr-32" />
                    <button onClick={async () => {
                      if (!editData.address) return;
                      setIsMagicLoading(true);
                      const res = await magicalCorrectLocation(editData.address);
                      setEditData({ ...editData, address: res, mapQuery: res });
                      setIsMagicLoading(false);
                    }} className="absolute right-2 top-2 bottom-2 bg-[#0E1A40] text-white px-3 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all">
                      <Icons.Magic /><span className="text-[9px] font-bold">魔法校正</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400">上傳憑證 (可多張)</label>
                    <div className="flex flex-wrap gap-2">
                      {editData.vouchers?.map((v: string, i: number) => (
                        <div key={i} className="relative w-12 h-12 rounded-lg border overflow-hidden"><img src={v} className="w-full h-full object-cover" /></div>
                      ))}
                      <button onClick={() => fileInputRef.current?.click()} className="w-12 h-12 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-300">＋</button>
                    </div>
                    <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'attraction_vouchers')} />
                  </div>
                </>
              )}
              {showModal === 'shopping' && (
                <>
                  <input type="text" placeholder="想買什麼？" value={editData.name} onChange={e => setEditData({ ...editData, name: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                  <div className="flex gap-4 items-center">
                    <button onClick={() => fileInputRef.current?.click()} className="flex-1 bg-white border-2 border-dashed border-gray-200 p-8 rounded-2xl flex flex-col items-center gap-2 text-gray-400">
                      {editData.photo ? <img src={editData.photo} className="w-full h-24 object-cover rounded-xl" /> : <span className="text-[10px] font-bold">上傳參考圖片</span>}
                    </button>
                    <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => handleImageUpload(e, 'shopping_photo')} />
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1 mt-2">委託巫師</p>
                  {renderMultiMember(editData.persons || [], (v) => setEditData({ ...editData, persons: v }))}
                </>
              )}
              {showModal === 'expense' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold mb-1 block uppercase">總金額 (整數)</label>
                      <input type="number" placeholder="必填 > 0" value={editData.amount || ''} onChange={e => setEditData({ ...editData, amount: Math.floor(Number(e.target.value)) })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold mb-1 block uppercase">幣別</label>
                      <select value={editData.currency} onChange={e => setEditData({ ...editData, currency: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold outline-none"><option value="JPY">日幣 JPY</option><option value="TWD">台幣 TWD</option></select>
                    </div>
                  </div>
                  <input type="text" placeholder="項目內容 (必填)" value={editData.content} onChange={e => setEditData({ ...editData, content: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold" />
                  <div className="grid grid-cols-2 gap-4">
                    <select value={editData.category} onChange={e => setEditData({ ...editData, category: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold outline-none">
                      {['食', '住', '用', '娛樂', '交通', '其他'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={editData.paymentMethod} onChange={e => setEditData({ ...editData, paymentMethod: e.target.value })} className="w-full bg-[#f5f5f5] p-4 rounded-2xl font-bold outline-none">
                      {['現金', '信用卡', '行動支付'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#0E1A40] uppercase tracking-widest block mb-2">付款巫師及金額</label>
                    {MEMBERS.map(m => (
                      <div key={m} className="flex items-center gap-2">
                        <button onClick={() => {
                            const isPayer = editData.payers.some((p: any) => p.name === m);
                            const nextPayers = isPayer ? editData.payers.filter((p: any) => p.name !== m) : [...editData.payers, { name: m, amount: 0 }];
                            setEditData({ ...editData, payers: nextPayers });
                        }} className={`w-16 py-2 rounded-xl text-[10px] font-bold transition-all ${editData.payers.some((p: any) => p.name === m) ? 'bg-[#0E1A40] text-white shadow-md' : 'bg-white border text-gray-300'}`}>{m}</button>
                        {editData.payers.some((p: any) => p.name === m) && <input type="number" value={editData.payers.find((p: any) => p.name === m).amount} onChange={e => setEditData({ ...editData, payers: editData.payers.map((p: any) => p.name === m ? { ...p, amount: Number(e.target.value) } : p) })} className="flex-1 bg-white p-2 rounded-xl text-xs border focus:border-[#0E1A40] outline-none" />}
                      </div>
                    ))}
                    <button onClick={() => {
                      const avg = Math.floor(editData.amount / (editData.payers.length || 1));
                      setEditData({ ...editData, payers: editData.payers.map((p: any) => ({ ...p, amount: avg })) });
                    }} className="text-[8px] underline text-gray-400">平均分攤付款</button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-[#0E1A40] uppercase tracking-widest block mb-2">分攤巫師及金額</label>
                    {MEMBERS.map(m => (
                      <div key={m} className="flex items-center gap-2">
                        <button onClick={() => {
                          const isSplitter = editData.splitters.some((p: any) => p.name === m);
                          const nextSplitters = isSplitter ? editData.splitters.filter((p: any) => p.name !== m) : [...editData.splitters, { name: m, amount: 0 }];
                          setEditData({ ...editData, splitters: nextSplitters });
                        }} className={`w-16 py-2 rounded-xl text-[10px] font-bold transition-all ${editData.splitters.some((p: any) => p.name === m) ? 'bg-[#0E1A40] text-white shadow-md' : 'bg-white border text-gray-300'}`}>{m}</button>
                        {editData.splitters.some((p: any) => p.name === m) && <input type="number" value={editData.splitters.find((p: any) => p.name === m).amount} onChange={e => setEditData({ ...editData, splitters: editData.splitters.map((p: any) => p.name === m ? { ...p, amount: Number(e.target.value) } : p) })} className="flex-1 bg-white p-2 rounded-xl text-xs border focus:border-[#0E1A40] outline-none" />}
                      </div>
                    ))}
                    <button onClick={() => {
                      const avg = Math.floor(editData.amount / (editData.splitters.length || 1));
                      setEditData({ ...editData, splitters: editData.splitters.map((p: any) => ({ ...p, amount: avg })) });
                    }} className="text-[8px] underline text-gray-400">平均分攤支出</button>
                  </div>
                </div>
              )}
              {showModal !== 'stats' && <button onClick={saveModal} className="w-full bg-[#0E1A40] text-white py-6 rounded-3xl font-bold uppercase tracking-widest shadow-xl border border-[#946A2D]/40 mt-4 transition-all active:scale-95">施展保存咒語</button>}
            </div>
          </div>
        </div>
      )}
      {viewImage && (<div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4" onClick={() => setViewImage(null)}><img src={viewImage} className="max-w-full max-h-full object-contain shadow-2xl rounded-lg" /><button className="absolute top-10 right-10 text-white text-3xl font-bold">×</button></div>)}
      {isMagicLoading && (
        <div className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-md flex items-center justify-center">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-4 animate-bounce">
            <Icons.Magic />
            <p className="serif text-[#0E1A40] font-bold">正在施展魔法...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
