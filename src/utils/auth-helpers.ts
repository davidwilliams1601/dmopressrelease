import { User } from 'firebase/auth';

/**
 * Force refresh the user's ID token to get latest claims and permissions
 * This is useful after user account changes (role updates, new account creation, etc.)
 */
export async function refreshUserToken(user: User | null): Promise<void> {
  if (!user) {
    console.warn('Cannot refresh token: no user logged in');
    return;
  }

  try {
    console.log('Refreshing user auth token...');
    const token = await user.getIdToken(true); // force refresh = true
    console.log('Token refreshed successfully');
    return;
  } catch (error) {
    console.error('Error refreshing user token:', error);
    throw error;
  }
}

/**
 * Check if the current user's token is stale (older than 55 minutes)
 * Firebase tokens expire after 1 hour, so we refresh proactively
 */
export async function isTokenStale(user: User | null): Promise<boolean> {
  if (!user) return false;

  try {
    const tokenResult = await user.getIdTokenResult();
    const issuedAt = new Date(tokenResult.issuedAtTime);
    const now = new Date();
    const ageMinutes = (now.getTime() - issuedAt.getTime()) / 1000 / 60;

    return ageMinutes > 55; // Token is stale if older than 55 minutes
  } catch (error) {
    console.error('Error checking token age:', error);
    return true; // Assume stale on error to trigger refresh
  }
}
