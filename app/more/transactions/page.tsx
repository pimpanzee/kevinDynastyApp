import Redirect from '@/components/Redirect';

/** Old route, kept so saved links and Home Screen shortcuts still land. */
export default function Page() {
  return <Redirect to="/league/" />;
}
