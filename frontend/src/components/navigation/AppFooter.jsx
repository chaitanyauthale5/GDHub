import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';

export default function AppFooter() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between text-sm text-gray-600">
        <div className="font-semibold">© {new Date().getFullYear()} SpeakUp</div>
        <div className="flex items-center gap-4">
          <Link to={createPageUrl('Terms')} className="hover:text-gray-900">Terms</Link>
          <Link to={createPageUrl('Privacy')} className="hover:text-gray-900">Privacy</Link>
          <Link to={createPageUrl('Contact')} className="hover:text-gray-900">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
