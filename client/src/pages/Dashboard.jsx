import { useNavigate } from "react-router-dom";

function Dashboard() {
  const navigate = useNavigate();

  const user = JSON.parse(
    sessionStorage.getItem("user") || "null"
  );

  const handleLogout = () => {
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");

    navigate("/login", { replace: true });
  };

  return (
    <div className="dashboard">
      <h1>Welcome, {user?.username || "User"}!</h1>

      <p>You have successfully logged in.</p>

      <p>Email: {user?.email || "Not available"}</p>

      <button onClick={handleLogout}>Logout</button>
    </div>
  );
}

export default Dashboard;