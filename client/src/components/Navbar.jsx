import React from 'react';
import { Link } from 'react-router-dom';
import { Code2, LogOut } from 'lucide-react';
import { useAuth } from '../AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <Link to="/home" className="navbar-brand">
        <span className="navbar-logo">
          <Code2 size={20} />
        </span>
        CodeBridge
      </Link>
      <div className="navbar-right">
        {user?.email && <span className="navbar-user">{user.email}</span>}
        <button className="btn btn-outline btn-sm" onClick={logout}>
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;