/**
 * @pops/app-media — Media app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load media pages under /media/*.
 */
export { navConfig, routes } from './routes';

// Side-effect: register search result components
import './components/search/register';
