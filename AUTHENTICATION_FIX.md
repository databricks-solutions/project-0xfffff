# Authentication & Login Fix - Permission Denied Issues

## Problem

Participants were sometimes running into "permission denied" or "do not have credentials" errors when trying to log in. They had to refresh the webpage to be able to log in successfully.

## Root Causes

### 1. **Race Condition in Initialization**
- `isLoading` was set to `false` BEFORE permissions finished loading
- Components would render before permissions were available
- This caused "permission denied" errors

### 2. **No Fallback for Permission Loading Failures**
- If permission loading failed due to network issues, the user would be stuck
- No default permissions were set
- Users couldn't access anything even after successful login

### 3. **Poor Error Recovery**
- Network failures during initialization weren't handled properly
- Errors would persist and block subsequent login attempts
- No retry mechanism

## Solution

### File: `client/src/context/UserContext.tsx`

#### 1. **Fixed Loading Race Condition**
- Moved `setIsLoading(false)` to the end of initialization (after permissions load)
- Ensures UI doesn't render until authentication state is fully ready
- Added proper await for permission loading

#### 2. **Added Default Permissions Fallback**
```typescript
// When permission loading fails (non-404 errors), set minimal defaults
setPermissions({
  can_annotate: true,
  can_view_rubric: true,
  can_create_rubric: false,
  can_manage_workshop: false,
  can_assign_annotations: false,
});
```

#### 3. **Improved Error Handling**
- Added try-catch blocks with proper error logging
- Clear errors before new login attempts
- Don't show error messages for non-critical permission failures
- Set loading states properly during login

#### 4. **Enhanced Login Function**
- Clear previous errors before attempting login
- Set loading state during login process
- Always reset loading state after login (success or failure)
- Better error messages

## What Changed

### Before:
```typescript
// isLoading set too early
await loadPermissions(validatedUser.id);
setIsLoading(false);  // ❌ Set before permissions loaded

// No fallback for permission errors
if (error) {
  setError(`Failed...`);  // ❌ Blocks UI
}
```

### After:
```typescript
// isLoading set after everything loads
await loadPermissions(validatedUser.id);
// ... more initialization ...
setIsLoading(false);  // ✅ Set at the very end

// Fallback for permission errors
if (error) {
  setPermissions(defaultPermissions);  // ✅ User can still log in
  console.warn('Using default permissions');
}
```

## Testing Scenarios

### Test 1: Normal Login
✅ **Result**: User logs in, permissions load, access granted

### Test 2: Login with Slow Network
✅ **Result**: Loading indicator shows until permissions fully load, no race condition

### Test 3: Login with Permission API Failure
✅ **Result**: User logs in with default permissions, can access basic features

### Test 4: Login with 404 (User Not Found)
✅ **Result**: Clears stale data, shows "session expired" message, allows fresh login

### Test 5: Rapid Navigation After Login
✅ **Result**: Components wait for `isLoading: false`, permissions are ready

## Benefits

1. ✅ **No More "Refresh Required"** - Race conditions eliminated
2. ✅ **Graceful Degradation** - Works even if permissions API is slow/fails
3. ✅ **Better Error Recovery** - Clears errors properly, allows retry
4. ✅ **Improved UX** - Loading states managed correctly
5. ✅ **More Resilient** - Handles network issues gracefully

## Technical Details

### Initialization Flow (Fixed)
1. Check localStorage for saved user
2. Validate user exists via API
3. Load user data
4. **Wait for permissions to load** ⬅️ Key fix
5. Set workshop ID if available
6. Set `isLoading: false` ⬅️ Moved to end

### Permission Loading (Enhanced)
1. Try to load permissions from API
2. If successful: Set permissions, clear errors
3. If 404: Clear user (session expired)
4. **If other error: Set default permissions** ⬅️ New fallback
5. Log errors for debugging

### Login Flow (Improved)
1. Clear previous errors
2. Set loading state
3. Make login API call
4. Load user with permissions
5. **Always reset loading state** ⬅️ Key fix
6. Clear errors on success

## Backwards Compatibility

✅ **Fully backwards compatible**
- All existing authentication flows work
- No database changes required
- No API changes needed
- Graceful fallbacks for all error cases

