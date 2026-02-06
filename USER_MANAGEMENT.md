# User Management System - PressPilot

## Overview

I've built the **backend infrastructure** for a complete self-service user management system. This allows organization admins to invite and manage team members without needing Firebase Console access or developer intervention.

## ✅ What's Deployed (Backend)

### Cloud Functions (Live in Production)

Three new Cloud Functions have been deployed to handle user management:

#### 1. `createOrgUser`
- **Purpose:** Create a new user account
- **Who can call:** Organization Admins only
- **What it does:**
  - Creates Firebase Auth account with temp password
  - Creates Firestore user document with role
  - Generates user initials from name
  - Returns temp password for the admin to share

#### 2. `deleteOrgUser`
- **Purpose:** Remove a user from the organization
- **Who can call:** Organization Admins only
- **What it does:**
  - Deletes user's Firestore document
  - Deletes user's Firebase Auth account
  - Prevents self-deletion (safety measure)

#### 3. `updateOrgUserRole`
- **Purpose:** Change a user's role (Admin <-> User)
- **Who can call:** Organization Admins only
- **What it does:**
  - Updates user's role in Firestore
  - Tracks who made the change and when

## 🔒 Security Model

### Multi-Tenant Isolation
- ✅ Admins can ONLY manage users in their own organization
- ✅ All functions verify admin status before allowing actions
- ✅ User documents are org-scoped (`/orgs/{orgId}/users/{userId}`)
- ✅ Cannot delete your own account (prevents lockout)

### Role-Based Access
- **Admin:** Can create, delete, and modify all users in their org
- **User:** Standard access, cannot manage other users

## 📋 Next Steps: Build the UI

To complete the system, you need a user management interface. Here's what to build:

### 1. Create User Management Page

Add a new page: `src/app/dashboard/settings/team/page.tsx`

**Features needed:**
- List all users in the organization
- Show user name, email, role, created date
- "Add User" button (opens dialog)
- Edit role dropdown for each user
- Delete user button (with confirmation)

### 2. Add User Dialog Component

Create: `src/components/settings/add-user-dialog.tsx`

**Form fields:**
- Name (text input)
- Email (email input)
- Role (dropdown: Admin/User)

**On submit:**
```typescript
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();
const createUser = httpsCallable(functions, 'createOrgUser');

const result = await createUser({
  orgId: 'visit-kent',
  email: formData.email,
  name: formData.name,
  role: formData.role
});

// Show temp password to admin
alert(`User created! Temp password: ${result.data.tempPassword}`);
```

### 3. Usage Example

```typescript
// Call Cloud Function from React component
import { getFunctions, httpsCallable } from 'firebase/functions';

const functions = getFunctions();

// Create user
const createUser = httpsCallable(functions, 'createOrgUser');
await createUser({
  orgId: 'visit-kent',
  email: 'newuser@example.com',
  name: 'Jane Doe',
  role: 'User'
});

// Delete user
const deleteUser = httpsCallable(functions, 'deleteOrgUser');
await deleteUser({
  orgId: 'visit-kent',
  userId: 'abc123xyz'
});

// Update role
const updateRole = httpsCallable(functions, 'updateOrgUserRole');
await updateRole({
  orgId: 'visit-kent',
  userId: 'abc123xyz',
  role: 'Admin'
});
```

## 🎯 Benefits

### For You (Developer)
- ✅ No manual user creation required
- ✅ Clients are self-sufficient
- ✅ Scales to unlimited organizations
- ✅ Secure by default

### For Your Clients (DMOs)
- ✅ Full control over team management
- ✅ No technical knowledge required
- ✅ Instant user provisioning
- ✅ No dependency on you

## 🚀 Production Workflow

When a new DMO signs up:

1. **You create the organization:**
   - Create org document in Firestore
   - Create first admin user document
   - Provide login credentials

2. **Admin manages their team:**
   - Admin logs into PressPilot
   - Goes to Settings → Team
   - Clicks "Add User"
   - Enters email, name, role
   - Shares temp password with new user
   - New user logs in and changes password

3. **Ongoing management:**
   - Admins can add/remove users anytime
   - Admins can promote users to Admin
   - Admins can demote other admins to User
   - Complete self-service!

## 📝 TODO: UI Components Needed

1. ✅ Cloud Functions (DONE)
2. ⏳ Team Management Page
3. ⏳ Add User Dialog
4. ⏳ Delete User Confirmation
5. ⏳ Change Role Dropdown
6. ⏳ Display Temp Password Modal
7. ⏳ User List Table

Would you like me to build these UI components now?
