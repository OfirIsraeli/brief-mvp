import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Bell, 
  Calendar, 
  LogOut,
  Mail, 
  MessageCircle, 
  MoreVertical, 
  Pause, 
  Play, 
  Plus, 
  Sparkles, 
  Trash2 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useBriefs } from '@/hooks/useBriefs';
import { useAuth } from '@/contexts/AuthContext';
import { VENUES } from '@/types/brief';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const Dashboard = () => {
  const navigate = useNavigate();
  const { briefs, isLoading, deleteBrief, toggleBriefActive } = useBriefs();
  const { user, signOut } = useAuth();

  const getVenueName = (venueId: string) => {
    const venue = VENUES.find((v) => v.id === venueId);
    return venue?.name || venueId;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const handleDeleteBrief = async (id: string) => {
    try {
      await deleteBrief(id);
    } catch (error) {
      console.error('Error deleting brief:', error);
    }
  };

  const handleToggleBrief = async (id: string) => {
    try {
      await toggleBriefActive(id);
    } catch (error) {
      console.error('Error toggling brief:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <span className="font-serif text-xl">Brief AI</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="hero" size="default" onClick={() => navigate('/onboarding')}>
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Brief</span>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background">
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={user?.user_metadata?.avatar_url} alt={user?.email || 'User'} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {user?.email?.charAt(0).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 md:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-serif mb-2">Your Briefs</h1>
            <p className="text-muted-foreground">
              Manage your personalized cultural scouts
            </p>
          </div>

          {isLoading ? (
            <div className="glass-card rounded-2xl p-12 text-center">
              <Sparkles className="w-8 h-8 text-primary animate-pulse mx-auto mb-4" />
              <p className="text-muted-foreground">Loading your briefs...</p>
            </div>
          ) : briefs.length === 0 ? (
            <motion.div
              className="glass-card rounded-2xl p-12 text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <Bell className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h2 className="text-2xl font-serif mb-2">No briefs yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Create your first brief to start receiving personalized event
                notifications from Tel Aviv's cultural scene.
              </p>
              <Button variant="hero" size="lg" onClick={() => navigate('/onboarding')}>
                <Plus className="w-5 h-5 mr-2" />
                Create Your First Brief
              </Button>
            </motion.div>
          ) : (
            <div className="grid gap-4">
              {briefs.map((brief, index) => (
                <motion.div
                  key={brief.id}
                  className={`glass-card rounded-xl p-6 transition-all ${
                    brief.isActive ? '' : 'opacity-60'
                  }`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.1 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            brief.isActive ? 'bg-success' : 'bg-muted-foreground'
                          }`}
                        />
                        <h3 className="font-semibold text-lg text-foreground">
                          {brief.name}
                        </h3>
                        {brief.deliveryMethod === 'whatsapp' ? (
                          <MessageCircle className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <Mail className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        {/* Genres & Artists */}
                        <div>
                          <p className="text-muted-foreground mb-1">Watching</p>
                          <div className="flex flex-wrap gap-1">
                            {brief.genres.slice(0, 3).map((genre) => (
                              <span
                                key={genre}
                                className="px-2 py-0.5 rounded-full bg-secondary text-foreground text-xs"
                              >
                                {genre}
                              </span>
                            ))}
                            {brief.artists.slice(0, 2).map((artist) => (
                              <span
                                key={artist}
                                className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs"
                              >
                                {artist}
                              </span>
                            ))}
                            {brief.genres.length + brief.artists.length > 5 && (
                              <span className="text-xs text-muted-foreground">
                                +{brief.genres.length + brief.artists.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Venues */}
                        <div>
                          <p className="text-muted-foreground mb-1">Venues</p>
                          <p className="text-foreground">
                            {brief.venues.slice(0, 3).map(getVenueName).join(', ')}
                            {brief.venues.length > 3 &&
                              ` +${brief.venues.length - 3} more`}
                          </p>
                        </div>

                        {/* Schedule */}
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <p className="text-foreground">
                            {brief.schedule.dayOfWeek}s at {brief.schedule.time}
                          </p>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-2 hover:bg-secondary rounded-lg transition-colors">
                          <MoreVertical className="w-5 h-5 text-muted-foreground" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleToggleBrief(brief.id)}>
                          {brief.isActive ? (
                            <>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause Brief
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Resume Brief
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteBrief(brief.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Brief
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default Dashboard;
