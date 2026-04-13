/**
 * @pops/app-finance — Finance app package
 *
 * Exports route definitions and navigation config for the shell
 * to lazily load finance pages under /finance/*.
 */
export { navConfig, routes } from './routes';

// Side-effect: register search result components
import './components/search/EntitiesResultComponent';
import './components/search/TransactionsResultComponent';
import './components/search/BudgetResult';
