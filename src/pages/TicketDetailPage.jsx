import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ticketService, TICKET_STATUS } from '../services/ticketService';
import { projectService } from '../services/projectService';
import { userService, AREAS } from '../services/userService';
import { messageService } from '../services/messageService';
// ✅ REMOVIDA a importação do serviço de baixo nível
// import { firestoreNotificationService } from '../services/firestoreNotificationService';
// ✅ ESTA É A ÚNICA IMPORTAÇÃO NECESSÁRIA
import notificationService from '../services/notificationService';
import ImageUpload from '../components/ImageUpload';
import Header from '../components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Clock, 
  User, 
  MessageSquare, 
  Send, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Camera,
  Calendar,
  MapPin,
  Loader2,
  ExternalLink,
  Upload,
  X,
  Image as ImageIcon,
  Settings,
  AtSign
} from 'lucide-react';

const TicketDetailPage = () => {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  
  const [ticket, setTicket] = useState(null);
  const [project, setProject] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);
  
  // ... (O resto do seu componente, estados e funções, pode permanecer exatamente o mesmo)
  // ... A chamada para `markNotificationsAsRead` agora funcionará porque o `notificationService` foi corrigido.

  const loadTicketData = async () => {
    // (código original)
  };

  useEffect(() => {
    if (ticketId && user) {
      loadTicketData();
      markNotificationsAsRead();
    }
  }, [ticketId, user]);

  const markNotificationsAsRead = async () => {
    if (!user?.uid || !ticketId) return;
    
    try {
      // Esta chamada agora vai encontrar a função correta no serviço corrigido
      await notificationService.markTicketNotificationsAsRead(user.uid, ticketId);
    } catch (error) {
      console.error('❌ Erro ao marcar notificações como lidas:', error);
    }
  };

  // ... (todas as outras funções permanecem iguais)
  
  if (loading) {
    // (código original)
  }

  if (error) {
    // (código original)
  }

  if (!ticket) {
    // (código original)
  }

  return (
    <div className="min-h-screen bg-gray-50">
       {/* ... (código JSX original) ... */}
    </div>
  );
};

export default TicketDetailPage;
