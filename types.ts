
export type Tab = 'itinerary' | 'booking' | 'split' | 'tools' | 'settings';
export type BookingSubTab = 'flights' | 'stays' | 'cars' | 'attractions' | 'packing' | 'shopping';

export interface ItineraryItem {
  id: string;
  day: string;
  time: string;
  stayDuration: string;
  displayName: string;
  actualLocation: string;
  mapQuery: string;
  note: string;
  transportToNext?: {
    mode: 'transit' | 'drive' | 'walk';
    duration: string;
  };
}

export interface FlightBooking {
  id: string;
  airline: string;
  flightNo: string;
  depCity: string;
  arrCity: string;
  depTime: string;
  arrTime: string;
  depTerminal: string;
  arrTerminal: string;
  persons: string[];
}

export interface StayBooking {
  id: string;
  hotelName: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  address: string;
  mapQuery: string;
  confirmCode: string;
  note: string;
  persons: string[];
}

export interface CarBooking {
  id: string;
  company: string;
  carModel: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string;
  returnTime: string;
  address: string;
  mapQuery: string;
  confirmCode: string;
  note: string;
  // Added to fix error in App.tsx
  voucher?: string;
}

export interface AttractionBooking {
  id: string;
  name: string;
  date: string;
  time: string;
  address: string;
  mapQuery: string;
  confirmCode: string;
  note: string;
  vouchers: string[]; // base64 strings
  // Added to fix error in App.tsx
  persons: string[];
}

export interface ShoppingItem {
  id: string;
  name: string;
  photo?: string; // base64 string
  persons: string[];
  done: boolean;
}

export interface Expense {
  id: string;
  amount: number;
  currency: 'JPY' | 'TWD';
  category: '食' | '住' | '用' | '娛樂' | '交通' | '其他'; // Added '娛樂'
  content: string;
  paymentMethod: '現金' | '信用卡' | '行動支付';
  receiptImage?: string; // base64 string for receipt
  date: string;
  payers: { name: string; amount: number }[];
  splitters: { name: string; amount: number }[];
  createdAt: number;
}
